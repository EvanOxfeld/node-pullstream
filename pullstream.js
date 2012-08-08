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
  this._buffer = new Buffer(10 * 1024 * 1024);
  this._bufferWriteIdx = 0;
  this._bufferReadIdx = 0;
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
    data.copy(this._buffer, this._bufferWriteIdx);
    this._bufferWriteIdx += data.length;
    this._emitter.emit('newdata');
  }
  if (end) {
    this._end = true;
    this._emitter.emit('end');
  }
};

PullStream.prototype.pull = over([
  [over.number, over.func, function (len, callback) {
    var self = this;
    self._emitter.on('newdata', dataOrEnd.bind(self, 'newdata'));
    self._emitter.on('end', dataOrEnd.bind(self, 'end'));

    function dataOrEnd(evt) {
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
    self._emitter.on('end', function () {
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
  this._emitter.on('newdata', dataOrEnd.bind(this, 'newdata'));
  this._emitter.on('end', dataOrEnd.bind(this, 'end'));
  process.nextTick(function () {
    dataOrEnd('newdata');
  });

  function dataOrEnd(evt) {
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
