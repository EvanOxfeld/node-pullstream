'use strict';

module.exports = PullStream;

var inherits = require("util").inherits;
var Stream = require('stream').Stream;
var over = require('over');
var events = require("events");
var streamBuffers = require("stream-buffers");

function PullStream() {
  var self = this;
  Stream.apply(this);
  this.readable = false;
  this.writable = true;
  this._emitter = new events.EventEmitter();
  this._pauseBuffer = new streamBuffers.WritableStreamBuffer();
  this._paused = false;
  this._positionInStream = 0;
  this._recvEnd = false;
  this.eof = false;
  this.on('pipe', function (srcStream) {
    if (srcStream.pause) {
      self.pause = function () {
        self._paused = true;
        srcStream.pause();
      };
    }

    if (srcStream.resume) {
      self.resume = function () {
        self._paused = false;
        self._sendPauseBuffer();
        srcStream.resume();
      };
    }
  });
}
inherits(PullStream, Stream);

PullStream.prototype._sendPauseBuffer = function () {
  var pauseData = this._pauseBuffer.getContents();
  this.process(pauseData);
};

PullStream.prototype.write = function (data) {
  this.process(data);
  return true;
};

PullStream.prototype.end = function (data) {
  this._recvEnd = true;
  if (data) {
    this.process(data);
  } else if (!this._paused) {
    if (this._emitter.listeners('end').length > 0) {
      this._emitter.emit('end');
    } else {
      this.emit('end');
    }
  }
  return true;
};

PullStream.prototype.process = function (data) {
  if (data) {
    if (this._paused) {
      this._pauseBuffer.write(data);
    } else {
      this._emitter.emit('data', data);
    }
  } else if (!data && this._recvEnd) {
    if (this._emitter.listeners('end').length === 0) {
      this.eof = true;
      this.emit('end');
    } else {
      this._emitter.emit('end');
    }
  }
};

PullStream.prototype.pull = over([
  [over.number, over.func, function (len, callback) {
    this._pull(len, callback);
  }],
  [over.func, function (callback) {
    this._pull(null, callback);
  }]
]);

PullStream.prototype._pull = function (len, callback) {
  if (len === 0) {
    return callback(null, new Buffer(0));
  }

  var self = this;
  var lenLeft = len;
  var resultBuffer = new streamBuffers.WritableStreamBuffer({
    initialSize: len || streamBuffers.DEFAULT_INITIAL_SIZE
  });
  self._emitter.on('data', dataOrEnd.bind(self, 'data'));
  self._emitter.on('end', dataOrEnd.bind(self, 'end'));
  if (this._recvEnd) {
    dataOrEnd('end');
  }

  function dataOrEnd(evt, data) {
    if (data) {
      var lenToCopy;
      if (len) {
        lenToCopy = Math.min(data.length, lenLeft);
      } else {
        lenToCopy = data.length;
      }
      resultBuffer.write(data.slice(0, lenToCopy));
      if (len) {
        lenLeft -= lenToCopy;
      }
    }
    if ((lenLeft === 0 || lenLeft === null) || evt === 'end') {
      self._emitter.removeAllListeners();
      var resultBufferContents = resultBuffer.getContents();
      if (!resultBufferContents && self._recvEnd) {
        callback(new Error("End of Stream"));
      } else {
        resultBufferContents.posInStream = self._positionInStream;
        self._positionInStream += resultBufferContents.length;
        callback(null, resultBufferContents);
      }
      if (data && lenToCopy < data.length) {
        //process.nextTick(function () {
          self.process(data.slice(lenToCopy));
        //});
      } else if (evt === 'end') {
        self.emit('end');
      }
    }
  }
};

PullStream.prototype.pipe = over([
  [over.number, over.object, function (len, destStream) {
    this._pipe(len, destStream);
  }],
  [over.object, function (destStream) {
    throw new Error("Not implemented");
    //this._pull(null, destStream);
  }]
]);

PullStream.prototype._pipe = function (len, destStream) {
  if (len === 0) {
    return callback(null, new Buffer(0));
  }

  var self = this;
  this._emitter.on('data', dataOrEnd.bind(this, 'data'));
  this._emitter.on('end', dataOrEnd.bind(this, 'end'));

  function dataOrEnd(evt, data) {
    var lenToWrite = Math.min(data.length, len);
    var bufferToWrite = data.slice(0, lenToWrite);
    bufferToWrite.posInStream = self._positionInStream;
    self._positionInStream += bufferToWrite.length;
    destStream.write(bufferToWrite);
    len -= lenToWrite;
    if (len === 0 || evt === 'end') {
      self._emitter.removeAllListeners();
      destStream.end();
      if (data && lenToWrite < data.length) {
        process.nextTick(function () {
          self.process(data.slice(lenToWrite));
        });
      } else if (evt === 'end') {
        self.emit('end');
      }
    }
  }
};

PullStream.prototype.pause = function () {
  this._paused = true;
};

PullStream.prototype.resume = function () {
  var self = this;
  process.nextTick(function () {
    self._paused = false;
    self._sendPauseBuffer();
  });
};
