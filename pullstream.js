'use strict';

module.exports = PullStream;

var inherits = require("util").inherits;
var Stream = require('stream').Stream;
var over = require('over');
var streamBuffers = require("stream-buffers");

function PullStream() {
  var self = this;
  Stream.apply(this);
  this.readable = false;
  this.writable = true;
  this._buffer = new streamBuffers.WritableStreamBuffer();
  this.paused = false;
  this._positionInStream = 0;
  this._recvEnd = false;
  this._serviceRequests = null;
  this.eof = false;
  this._srcStream = null;
  this.on('pipe', function (srcStream) {
    self._srcStream = srcStream;
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
  this.data = function () {
    throw new Error("End already called");
  };
  this.end = function () {
    throw new Error("End already called");
  };

  this._recvEnd = true;
  if (data) {
    this._buffer.write(data);
  }
  this.process();
  return true;
};

PullStream.prototype.process = function () {
  if (this._recvEnd && this._serviceRequests === null) {
    this._finish();
  } else {
    if (this._serviceRequests) {
      this._serviceRequests();
    }
  }
};

PullStream.prototype._finish = function () {
  this.emit('end');
  this.emit('close');
};

PullStream.prototype.pull = over([
  [over.numberOptionalWithDefault(null), over.func, function (len, callback) {
    if (len === 0) {
      return callback(null, new Buffer(0));
    }

    var self = this;
    this._serviceRequests = pullServiceRequest;
    pullServiceRequest();

    function pullServiceRequest() {
      if (self.paused) {
        return;
      }

      if ((len !== null && self._buffer.size() >= len) || (len === null && self._recvEnd)) {
        self._serviceRequests = null;
        var results = self._buffer.getContents(len);
        results.posInStream = self._positionInStream;
        self._positionInStream += results.length;
        callback(null, results);

        if (self._recvEnd && self._buffer.size() === 0) {
          self._finish();
        }
      } else if (self._recvEnd && self._buffer.size() === 0) {
        callback(new Error('End of Stream'));
        self._finish();
      }
    }
  }]
]);

PullStream.prototype.pipe = over([
  [over.numberOptionalWithDefault(null), over.object, function (len, destStream) {
    if (len === 0) {
      return callback(null, new Buffer(0));
    }

    var self = this;
    var lenLeft = len;
    this._serviceRequests = pipeServiceRequest;
    pipeServiceRequest();

    function pipeServiceRequest() {
      if (self.paused) {
        return;
      }

      var lenToRemove;
      if (lenLeft === null) {
        lenToRemove = self._buffer.size();
      } else {
        lenToRemove = Math.min(self._buffer.size(), lenLeft);
      }
      if (lenToRemove > 0) {
        var results = self._buffer.getContents(lenToRemove);
        results.posInStream = self._positionInStream;
        self._positionInStream += results.length;
        if (lenLeft !== null) {
          lenLeft -= lenToRemove;
          if (lenLeft === 0) {
            self._serviceRequests = null;
          }
        }
        destStream.write(results);
        if (lenLeft === 0) {
          destStream.end();
          destStream = null;
        }
      }

      if (self._recvEnd && self._buffer.size() === 0) {
        if (destStream) {
          destStream.end();
          destStream = null;
        }
        self._finish();
      }
    }

    return destStream;
  }]
]);

PullStream.prototype.pause = function () {
  this.paused = true;
  if (this._srcStream && this._srcStream.pause) {
    this._srcStream.pause();
  }
};

PullStream.prototype.resume = function () {
  var self = this;
  process.nextTick(function () {
    self.paused = false;
    self._sendPauseBuffer();
    if (self._srcStream && self._srcStream.resume) {
      self._srcStream.resume();
    }
  });
};
