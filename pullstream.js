'use strict';

module.exports = PullStream;

var inherits = require("util").inherits;
var Stream = require('stream').Stream;
var over = require('over');
var events = require("events");

function PullStream() {
  Stream.apply(this);
  this.readable = false;
  this.writable = true;
  this._emitter = new events.EventEmitter();
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
    this._emitter.emit('end', data);
  }
};

PullStream.prototype.pull = over([
  [over.number, over.func, function (len, callback) {
    var self = this;
    var resultBuffer = new Buffer(len);
    self._emitter.on('data', dataOrEnd.bind(self, 'data'));
    self._emitter.on('end', dataOrEnd.bind(self, 'end'));

    function dataOrEnd(evt, data) {
      if (self._bufferWriteIdx - self._bufferReadIdx > len) {
        var result = this._buffer.slice(self._bufferReadIdx, self._bufferReadIdx + len);
        self._bufferReadIdx += len;
        self._emitter.removeAllListeners();
        callback(null, result);
        if (evt === 'end') {
          self.emit('end');
        }
      }
    }
  }],
  [over.func, function (callback) {
    var self = this;
    self._emitter.on('end', function (data) {
      var len = self._bufferWriteIdx - self._bufferReadIdx;
      var result = self._buffer.slice(self._bufferReadIdx, self._bufferReadIdx + len);
      self._bufferReadIdx += len;
      self._emitter.removeAllListeners();
      callback(null, result);
      self.emit('end');
    });
  }]
]);

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
  var self = this;
  this._emitter.on('data', dataOrEnd.bind(this, 'data'));
  this._emitter.on('end', dataOrEnd.bind(this, 'end'));
  process.nextTick(function () {
    dataOrEnd('data');
  });

  function dataOrEnd(evt, data) {
    var lenToSend = Math.min(self._bufferWriteIdx - self._bufferReadIdx, len);
    if (lenToSend > 0) {
      var result = self._buffer.slice(self._bufferReadIdx, self._bufferReadIdx + lenToSend);
      self._bufferReadIdx += lenToSend;
      var newLen = len - lenToSend;
      destStream.write(result);
      self._emitter.removeAllListeners();
      if (newLen === 0) {
        destStream.end();
      } else {
        self._pipe(newLen, destStream);
      }
      if (evt === 'end') {
        self.emit('end');
      }
    }
  }
};
