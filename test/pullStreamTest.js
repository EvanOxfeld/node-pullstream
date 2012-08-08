'use strict';

var test = require('tap').test;
var streamBuffers = require("stream-buffers");
var PullStream = require('../');

test("source sending 1-byte at a time", function (t) {
  var ps = new PullStream();
  ps.on('end', function () {
    t.end();
  });

  var sourceStream = new streamBuffers.ReadableStreamBuffer({
    frequency: 0,
    chunkSize: 1
  });

  sourceStream.pipe(ps);
});

