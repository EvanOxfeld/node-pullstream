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
  this._buffer = new streamBuffers.WritableStreamBuffer();
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
  this.process();
};

PullStream.prototype.write = function (data) {
  this._buffer.write(data);
  this.process();
  return true;
};

PullStream.prototype.end = function (data) {
  this._recvEnd = true;
  if (data) {
    this._buffer.write(data);
  }
  this.process();
  return true;
};

PullStream.prototype.process = function (data) {
  if (this._recvEnd && this._emitter.listeners('data').length === 0) {
    this.emit('end');
  } else {
    this._emitter.emit('data');
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
  self._emitter.on('data', dataOrEnd);
  dataOrEnd();

  function dataOrEnd() {
    if (self._paused) {
      return;
    }

    if ((len !== null && self._buffer.size() >= len) || (len === null && self._recvEnd)) {
      self._emitter.removeAllListeners();
      var results = self._buffer.getContents(len);
      results.posInStream = self._positionInStream;
      self._positionInStream += results.length;
      callback(null, results);

      if (self._recvEnd && self._buffer.size() === 0) {
        self.emit('end');
      }
    } else if (self._recvEnd && self._buffer.size() === 0) {
      callback(new Error('End of Stream'));
      self.emit('end');
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
  var lenLeft = len;
  this._emitter.on('data', dataOrEnd);
  dataOrEnd();

  function dataOrEnd() {
    if (self._paused) {
      return;
    }

    var lenToRemove = Math.min(self._buffer.size(), lenLeft);
    if (lenToRemove > 0) {
      var results = self._buffer.getContents(lenToRemove);
      results.posInStream = self._positionInStream;
      self._positionInStream += results.length;
      destStream.write(results);
      lenLeft -= lenToRemove;
    }

    if (lenLeft === 0) {
      self._emitter.removeAllListeners();
      destStream.end();
    }

    if (self._recvEnd && self._buffer.size() === 0) {
      self.emit('end');
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
