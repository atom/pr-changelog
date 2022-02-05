#! /usr/bin/env node
'use strict';

var expandHomeDir = require('expand-home-dir');
var Changelog = require('./changelog');
var Logger = require('./logger');
// let argv = require('yargs')
//   .usage('Usage: $0 [options] <baseTag>...<headTag>')
//   .alias('r', 'repo')
//   .describe('r', 'Repository e.g. atom/atom')
//   .default('r', 'atom/atom')
//   .alias('l', 'local-clone')
//   .describe('l', 'Path to local clone of repository')
//   .boolean('P')
//   .alias('P', 'packages')
//   .describe('P', 'Generate changelog for the changed packages. Uses `packageDependencies` package.json key')
//   .boolean('v')
//   .alias('v', 'verbose')
//   .describe('v', 'Verbose')
//   .help('h')
//   .alias('h', 'help')
//   .demand(1)
//   .argv
//
// Logger.setVerbose(argv.verbose)
//
// let spanRegex = /(.+)(?:[\.]{3})(.+)/
// let repoRegex = /([^\/]+)\/([^\/]+)/
//
// let [__, fromTag, toTag] = spanRegex.exec(argv._[0])
// let [___, owner, repo] = repoRegex.exec(argv.repo)
var localClone = expandHomeDir('~' + '/Desktop/projects/github/atom');
console.log({ localClone: localClone });
var dependencyKey = 'packageDependencies';

Changelog.getChangelog({
  owner: 'atom',
  repo: 'atom',
  fromTag: '1.58-releases',
  toTag: '1.59-releases',
  localClone: localClone,
  dependencyKey: 'packageDependencies',
  changelogFormatter: Changelog.defaultChangelogFormatter
}).then(function (output) {
  console.log({ output: output });
}).catch(function (err) {
  console.error('error', err.stack || err);
});