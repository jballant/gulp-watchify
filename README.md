gulp-watchify
=============

Gulp plugin that uses [watchify](https://github.com/substack/watchify) to efficiently re-bundle changed CommonJS dependencies.

Creates a transform stream that takes entry files (from something like gulp.src) and passes through a bundled file (vynil.File instances).

Additionally, can be used to persist the process, watch dependencies and automatically rebundle them, emitting another file stream with the 'rebundle' event. If ```options.watch``` is false, gulp-watchify just uses [browserify](https://github.com/substack/node-browserify) instead.

Example:
--------

```
var gulpWatchify = require('gulp-watchify');

gulp.task('javascript-watch', function () {
    var jsDest = './public/bundles',
        bundlerStream = gulpWatchify({
            watch: true,
            verbose: false,
            bundlerOptions: {
                debug: true // output source maps
            }
        });

    // When bundler stream emits a 'rebundle' event,
    // it passes a vinyl.File stream that you can pipe
    // to gulp.dest to re-write the file.
    bundlerStream.on('rebundle', function (stream) {
        stream.pipe(gulp.dest(jsDest));
    });

    // Get browserify entry files as a stream with src
    return gulp.src('./js/entries')

        // pipe the source files through the gulp-watchify
        // instance stream, which then sends through finished
        // bundles as vinyl.File instances
        .pipe(bundlerStream)

        // Sent the output files to a gulp.dest stream
        .pipe(gulp.dest(jsDest)); // send it to your desired output folder
});
```

In the example above, if you have a file ```./js/entries/foo.js```, which requires ```./js/lib/bar.js```, you will get an output file ```./public/bundles/foo.js``` with 'foo.js' and 'bar.js' bundled together. Additionally, the process will keep running with a watcher that monitors the 'foo.js' and 'bar.js'. If either one is modified, then they will be re-bundled and piped to gulp.dest again which writes './public/bundles/foo.js' again.

