'use strict';

module.exports = PullStream;

var inherits = require("util").inherits;
var Stream = require('stream').Stream;

function PullStream() {
  Stream.apply(this);
  this.readable = false;
  this.writable = true;
}
inherits(PullStream, Stream);

PullStream.prototype.write = function (data) {
  this.process(data, false);
};

PullStream.prototype.end = function (data) {
  this.process(data, true);
};

PullStream.prototype.process = function (data, end) {
  if (end) {
    this.emit('end');
  }
};


