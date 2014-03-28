/*jslint node:true*/
"use strict";

var
    Duplex = require('stream').Duplex,
    Transform = require('stream').Transform,
    Readable = require('stream').Readable,
    fs = require('graceful-fs'),
    path = require('path'),
    util = require('util'),
    gutil = require('gulp-util'),
    watchify = require('watchify'),
    browserify = require('browserify'),
    copy = require('shallow-copy'),
    gcolors = gutil.colors,
    PluginError = gutil.PluginError;

/**
 * Simple function to make a readable time stamp
 * @returns {string}
 */
function makeTimeString() {
    var date = new Date(),
        minutes = String(date.getMinutes()),
        seconds = String(date.getSeconds());

    minutes = (minutes.length === 1) ? '0' + minutes : minutes;
    seconds = (seconds.length === 1) ? '0' + seconds : seconds;

    return date.getHours() + ':' + minutes + ':' + seconds;
}


/**
 * Abstract pseudoclass for watchify/browserify
 * bundle streams.
 * @type AbstractBundleStream
 * @extends Stream.Transform
 * @param options
 * @constructor
 */
function AbstractBundleStream(options) {
    Transform.call(this, { objectMode: true });

    this.verbose = (typeof options.verbose === 'boolean') ? options.verbose : true;

    this._skipUpdateError = (typeof options.skipUpdateError === 'boolean') ? options.skipUpdateError : true;
}

util.inherits(AbstractBundleStream, Transform);

/**
 * Create a new gutil.File to represent the bundle
 * @param {gutil.File} srcFile
 * @param {string} source
 * @returns {gutil.File}
 * @private
 */
AbstractBundleStream.prototype._createBundleFile = function (srcFile, source) {
    return new gutil.File({
        contents: new Buffer(source),
        base: srcFile.base,
        cwd: srcFile.cwd,
        path: srcFile.path
    });
};

/**
 * @type GulpWatchify.ReBundle
 *
 * Used to create a simple stream that
 * rebundles main files
 *
 * @param bundler
 * @constructor
 */
function ReBundle(bundlerInstance, options) {
    AbstractBundleStream.call(this, options);
    this._bundlerInstance = bundlerInstance;

    this.on('end', function () {
        gutil.log(gcolors.green('======================='));
        gutil.log(gcolors.cyan(makeTimeString()), gcolors.green('Successfully updated bundles with changed dependencies'));
        gutil.log(gcolors.white("---------------"));
        gutil.log(gcolors.white("Watching..."));
    });
}

// ReBundle inherits from AbstractBundleStream's prototype
util.inherits(ReBundle, AbstractBundleStream);

ReBundle.prototype._transform = function (srcFile, encoding, done) {
    var self = this;

    this._bundlerInstance.bundle(function (err, source) {
        if (err) {
            // watch errors don't have to be fatal, but if 
            // the skipUpdateError option is false, they
            // will be
            if (!self._skipUpdateError) {
                done(new PluginError('gulp-watchify', err));
                return;
            }
            // If skipUpdateError is true log error but proceed
            gutil.log(gcolors.cyan(makeTimeString()), gcolors.red('Encountered Error, failed to create bundle for "'), gcolors.magenta(srcFile.path), '"');
            gutil.log(err);
            done();
            return;
        }

        var file = self._createBundleFile(srcFile, source);

        self.push(file);
        if (self.verbose) {
            gutil.log(gcolors.cyan(makeTimeString()), '-> Successfully Re-Bundled changed file', srcFile.path);
        }
        done();
    });
    gutil.log(gcolors.cyan(makeTimeString()), '* Updating bundle for entry file :', srcFile.path);
};

/**
 * @constructor
 * @type {GulpWatchify}
 * @extends {AbstractBundleStream}
 * @param {object} options [description]
 */
function GulpWatchify(options) {
    options = options || {};

    AbstractBundleStream.call(this, options);

    /**
     * If watching should be turned on or not. If false, watchify is switched
     * out for browserify.
     * @type {boolean}
     */
    this.watch = (typeof options.watch === 'boolean') ? options.watch : true;

    /**
     * User can optionally turn off caching watchify dependencies if they choose
     * @type {boolean}
     */
    options.primeCache = (typeof options.primeCache === 'boolean') ? options.primeCache : true;

    /**
     * User can optionally turn of sharing watchers want to. Sharing watchers is done
     * to stop multiple watcher instances being created on the same files. If no, this
     * may cause node to throw maximum listener warnings
     * @type {boolean}
     */
    options.shareWatchers = (typeof options.shareWatchers === 'boolean') ? options.shareWatchers : true;

    /**
     * Options to pass to the bundler when it is created
     * @type {object}
     */
    this.bundlerOptions = options.bundlerOptions || {};

    /**
     * If you want this GulpWatchify instance to automatically create a ReBundle stream
     * when an update occurs. The GulpWatchify instance emits a 'rebundle' event and
     * passes the ReBundle stream
     * @type {boolean}
     */
    this._rebundle = (typeof options.rebundle === 'boolean') ? options.rebundle : true;

    /**
     * The bundler function to use to create common js bundles
     * @type {object}
     */
    this._bundler = options.Bundler;

    if (!this._bundler) {
        this._bundler = options.watch ? watchify : browserify;
    }

    /**
     * Transforms to add to the bundler instance
     */
    this._transforms = options.transforms || [];

    if (options.primeCache) {
        /**
         * Used to store all dependencies so that they can be shared
         * among watchify instances to speed up bundling
         * @memberOf GulpWachify#
         * @type {Object}
         */
        this._depsCache = {};

        /**
         * Used to store watchify packages so that they can be
         * shared among watchify instances to speed up building
         */
        this._packageCache = {};
    }

    if (options.shareWatchers) {
        this._watchers = {};
    }

    /**
    * Path to destination directory or file.
    * @type {string}
    */
    this._bundlers = options.bundlers || {};

    this.on('end', function () {
        if (this.verbose) {
            gutil.log(gcolors.green("============================="));
            gutil.log(gcolors.green("Successfully Wrote JS Bundles"));
            if (this.watch) {
                gutil.log(gcolors.white("---------------"));
                gutil.log(gcolors.white("Watching..."));
            }
        }
    });

}

// GulpWatchify should inherit from the abstract pseudoclass
util.inherits(GulpWatchify, AbstractBundleStream);


/**
 * Pass through newer files only.
 * @param {File} srcFile A vinyl file.
 * @param {string} encoding Encoding (ignored).
 * @param {function(Error, File)} done Callback.
 */
GulpWatchify.prototype._transform = function (srcFile, encoding, done) {
    if (!srcFile || !srcFile.path) {
        done(new PluginError('gulp-watchify', 'Expected a source file with a path'));
        return;
    }

    var self = this,
        opts = copy(this.bundlerOptions),
        bundler;

    opts.cache = this._depsCache;
    opts.pkgCache = this._packageCache;
    opts.packageCache = this._packageCache;
    opts.watchers = this._watchers;

    bundler = this._bundler(opts);

    bundler.add(srcFile);

    bundler.on('watch', function (watcher) {
        watcher.setMaxListeners(50);
    });

    bundler.on('update', function () {
        self.emit('update', srcFile, bundler);
        self._handleUpdate(srcFile, bundler);
    });

    this._bundlers[srcFile.path] = bundler;

    this._transforms.forEach(function (tr) {
        bundler.transform(tr.opts, tr.tr);
    });

    function firstBundleCallback(err, source) {
        if (err) {
            done(new PluginError('gulp-watchify', err));
            return;
        }

        var file = self._createBundleFile(srcFile, source);

        self.push(file);
        if (self.verbose) {
            gutil.log(gcolors.cyan(makeTimeString()), gcolors.green('-> Successfully bundled file"'), gcolors.magenta(srcFile.path), gcolors.green('"'));
        }
        done();
    }

    bundler.bundle(firstBundleCallback);

    if (this.verbose) {
        gutil.log(gcolors.cyan(makeTimeString()), '*Bundling file "', gcolors.magenta(srcFile.path), '"...');
    }

};

/**
 * Buffer update events through a ReBundle stream. If
 * the _rebundleDelay (ms) time passes with no update events,
 * the stream closes
 * @param srcFile
 * @param bundler
 * @returns {GulpWatchify}
 * @private
 */
GulpWatchify.prototype._handleUpdate = function (srcFile, bundler) {
    if (!this._rebundle) {
        return this;
    }
    var self = this,
        rebundle = self._rebundleStream;

    clearTimeout(self._rebundleTimeout);

    if (!rebundle) {
        rebundle = self._rebundleStream = new ReBundle(bundler, {
            verbose: self.verbose,
            skipUpdateError: self._skipUpdateError
        });
        self.emit('rebundle', rebundle);
    }

    self._rebundleStream.write(srcFile);


    self._rebundleTimeout = setTimeout(function () {
        rebundle.push(null);
        self._rebundleStream = null;
    }, self._rebundleDelay || 400);
};

/**
 * Remove references to buffered files.
 * @param {function(Error)} done Callback.
 */
GulpWatchify.prototype._flush = function (done) {
    done();
};


/**
 * Takes source files and passes through a bundled file. If
 * watch option is true, listens for updates and passes an
 * update event. If 'rebundle' is true, then on an update
 * will create a transform stream and that you can read
 * bundles through the 'rebundle' event.
 * @param {string} dest Path to destination directory or file.
 * @return {Newer} A transform stream.
 */
module.exports = function (options) {
    return new GulpWatchify(options);
};