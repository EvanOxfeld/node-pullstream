'use strict';

var test = require('tap').test;
var fs = require("fs");
var path = require("path");
var streamBuffers = require("stream-buffers");
var PullStream = require('../');

test("source sending 1-byte at a time", function (t) {
  t.plan(3);

  var ps = new PullStream();
  ps.on('end', function () {
    sourceStream.destroy();
    t.end();
  });

  var sourceStream = new streamBuffers.ReadableStreamBuffer({
    frequency: 0,
    chunkSize: 1
  });
  sourceStream.put("Hello World!");

  sourceStream.pipe(ps);

  ps.pull('Hello'.length, function (err, data) {
    if (err) {
      t.fail(err);
    }
    t.equal('Hello', data.toString());

    var writableStream = new streamBuffers.WritableStreamBuffer({
      initialSize: 100
    });
    writableStream.on('close', function () {
      var str = writableStream.getContentsAsString('utf8');
      t.equal(' World', str);

      ps.pull(function (err, data) {
        if (err) {
          t.fail(err);
        }
        t.equal('!', data.toString());
      });
    });

    ps.pipe(' World'.length, writableStream);
  });
});

test("source sending all data at once", function (t) {
  t.plan(3);

  var ps = new PullStream();
  ps.on('end', function () {
    sourceStream.destroy();
    t.end();
  });

  var sourceStream = new streamBuffers.ReadableStreamBuffer({
    frequency: 0,
    chunkSize: 1000
  });
  sourceStream.put("Hello World!");

  sourceStream.pipe(ps);

  ps.pull('Hello'.length, function (err, data) {
    if (err) {
      t.fail(err);
    }
    t.equal('Hello', data.toString());

    var writableStream = new streamBuffers.WritableStreamBuffer({
      initialSize: 100
    });
    writableStream.on('close', function () {
      var str = writableStream.getContentsAsString('utf8');
      t.equal(' World', str);

      ps.pull(function (err, data) {
        if (err) {
          t.fail(err);
        }
        t.equal('!', data.toString());
      });
    });

    ps.pipe(' World'.length, writableStream);
  });
});

test("two length pulls", function (t) {
  t.plan(2);

  var ps = new PullStream();
  ps.on('end', function () {
    sourceStream.destroy();
    t.end();
  });

  var sourceStream = new streamBuffers.ReadableStreamBuffer({
    frequency: 0,
    chunkSize: 1000
  });
  sourceStream.put("Hello World!");

  sourceStream.pipe(ps);

  ps.pull('Hello'.length, function (err, data) {
    if (err) {
      t.fail(err);
    }
    t.equal('Hello', data.toString());

    ps.pull(' World!'.length, function (err, data) {
      if (err) {
        t.fail(err);
      }
      t.equal(' World!', data.toString());
    });
  });
});

test("read from file", function (t) {
  t.plan(2);

  var ps = new PullStream();
  ps.on('end', function () {
    t.end();
  });

  var sourceStream = fs.createReadStream(path.join(__dirname, 'testFile.txt'));

  sourceStream.pipe(ps);

  ps.pull('Hello'.length, function (err, data) {
    if (err) {
      t.fail(err);
    }
    t.equal('Hello', data.toString());

    ps.pull(' World!'.length, function (err, data) {
      if (err) {
        t.fail(err);
      }
      t.equal(' World!', data.toString());
    });
  });
});

test("pause/resume", function (t) {
  t.plan(2);

  var ps = new PullStream();
  ps.on('end', function () {
    sourceStream.destroy();
    t.end();
  });

  var sourceStream = new streamBuffers.ReadableStreamBuffer({
    frequency: 0,
    chunkSize: 1000
  });
  sourceStream.put("Hello World!");

  sourceStream.pipe(ps);

  ps.pause();
  process.nextTick(function () {
    ps.resume();
    ps.pull('Hello'.length, function (err, data) {
      if (err) {
        t.fail(err);
      }
      t.equal('Hello', data.toString());

      ps.pull(' World!'.length, function (err, data) {
        if (err) {
          t.fail(err);
        }
        t.equal(' World!', data.toString());
      });
    });
  });
});

test("read past end of stream", function (t) {
  t.plan(1);

  var ps = new PullStream();
  ps.on('end', function () {
    sourceStream.destroy();
    t.end();
  });

  var sourceStream = new streamBuffers.ReadableStreamBuffer({
    frequency: 0,
    chunkSize: 1000
  });
  sourceStream.put("Hello World!");

  sourceStream.pipe(ps);

  ps.pull('Hello World!'.length, function (err, data) {
    if (err) {
      t.fail(err);
    }
    t.equal('Hello World!', data.toString());

    ps.pull(1, function (err, data) {
      if (err) {
        return; // ok
      }
      t.fail('should get an error');
    });
  });
});
