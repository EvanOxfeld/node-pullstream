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
  this.on('pipe', function (srcStream) {
    self.pause = function () {
      srcStream.pause();
    };

    self.resume = function () {
      srcStream.resume();
    };
  });
}
inherits(PullStream, Stream);

PullStream.prototype.write = function (data) {
  this.process(data, false);
};

PullStream.prototype.end = function (data) {
  this.process(data, true);
};

PullStream.prototype.process = function (data, end) {
  if (data) {
    this._emitter.emit('data', data);
  }
  if (end) {
    this._end = true;
    if (this._emitter.listeners('end').length === 0) {
      this.emit('end');
    } else {
      this._emitter.emit('end', data);
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

  function dataOrEnd(evt, data) {
    if (data) {
      var lenToCopy;
      if (len) {
        lenToCopy = Math.min(data.length, lenLeft);
      } else {
        lenToCopy = data.length;
      }
      resultBuffer.write(data.slice(0, lenToCopy));
      lenLeft -= lenToCopy;
    }
    if (lenLeft === 0 || evt === 'end') {
      self._emitter.removeAllListeners();
      var resultBufferContents = resultBuffer.getContents();
      if (!resultBufferContents && self._end) {
        callback(new Error("End of Stream"));
      } else {
        callback(null, resultBufferContents || new Buffer(0));
      }
      if (data && lenToCopy < data.length) {
        self.process(data.slice(lenToCopy), evt === 'end');
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
    destStream.write(data.slice(0, lenToWrite));
    len -= lenToWrite;
    if (len === 0 || evt === 'end') {
      self._emitter.removeAllListeners();
      destStream.end();
      if (data && lenToWrite < data.length) {
        process.nextTick(function () {
          self.process(data.slice(lenToWrite), evt === 'end');
        });
      } else if (evt === 'end') {
        self.emit('end');
      }
    }
  }
};
