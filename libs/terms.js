/**
 * External module Dependencies.
 */
var mkdirp = require("mkdirp"),
  path = require("path"),
  fs = require("fs"),
  when = require("when"),
  guard = require("when/guard"),
  parallel = require("when/parallel");

const cliProgress = require("cli-progress");
const colors = require("ansi-colors");
const chalk = require("chalk");
/**
 * Internal module Dependencies.
 */
var helper = require("../utils/helper");

var termsConfig = config.modules.terms,
  termsids = [],
  limit = 100;
(termsFolderPath = path.resolve(
  config.data,
  config.entryfolder,
  termsConfig.dirName
)),
  (masterFolderPath = path.resolve(config.data, "master", config.entryfolder)),
  (termsCountQuery =
    "SELECT count(<<tableprefix>>terms.term_id)as termscount FROM <<tableprefix>>terms,<<tableprefix>>term_taxonomy WHERE <<tableprefix>>terms.term_id=<<tableprefix>>term_taxonomy.term_id AND  <<tableprefix>>term_taxonomy.taxonomy='category' ORDER BY <<tableprefix>>term_taxonomy.parent"),
  (termsQuery =
    "SELECT <<tableprefix>>terms.term_id as ID,<<tableprefix>>terms.name,<<tableprefix>>terms.slug FROM <<tableprefix>>terms"),
  (termsByIDQuery =
    "SELECT <<tableprefix>>terms.term_id as ID,<<tableprefix>>terms.name,<<tableprefix>>terms.slug FROM <<tableprefix>>terms");

/**
 * Create folders and files
 */
if (!fs.existsSync(termsFolderPath)) {
  mkdirp.sync(termsFolderPath);
  helper.writeFile(path.join(termsFolderPath, termsConfig.fileName));
  mkdirp.sync(masterFolderPath);
  helper.writeFile(
    path.join(masterFolderPath, termsConfig.masterfile),
    '{"en-us":{}}'
  );
}

function ExtractTerms() {
  this.connection = helper.connect();
}

ExtractTerms.prototype = {
  customBar: null,
  initalizeLoader: function () {
    this.customBar = new cliProgress.SingleBar({
      format:
        "{title}|" +
        colors.cyan("{bar}") +
        "|  {percentage}%  || {value}/{total} completed",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    });
  },
  destroyLoader: function () {
    if (this.customBar) {
      this.customBar.stop();
    }
  },
  saveterms: function (termsDetails) {
    var self = this;
    return when.promise(function (resolve, reject) {
      self.customBar.start(termsDetails.length, 0, {
        title: "Migrating Terms      ",
      });
      var termsdata = helper.readFile(
        path.join(termsFolderPath, termsConfig.fileName)
      );
      var termsmaster = helper.readFile(
        path.join(masterFolderPath, termsConfig.masterfile)
      );
      termsDetails.map(function (data, index) {
        var title = data["name"];
        var id = data["ID"];
        var slug = data["slug"];

        var uid = id + Math.floor(Math.random() * 10000000);
        termsdata[`terms_${uid}`] = {
          uid: `terms_${uid}`,
          title: title,
          url: `/category/${uid}`,
          slug: slug,
        };
        termsmaster["en-us"][slug] = "";
        self.customBar.increment();
      });
      helper.writeFile(
        path.join(termsFolderPath, termsConfig.fileName),
        JSON.stringify(termsdata, null, 4)
      );
      helper.writeFile(
        path.join(masterFolderPath, termsConfig.masterfile),
        JSON.stringify(termsmaster, null, 4)
      );
      resolve();
    });
  },
  getterms: function (skip) {
    var self = this;
    return when.promise(function (resolve, reject) {
      var query;
      if (termsids.length == 0) {
        query = termsQuery; //Query for all terms
      } else {
        query = termsByIDQuery; //Query for caegories by id
        query = query.replace("<<catids>>", "(" + termsids + ")");
      }
      query = query.replace(/<<tableprefix>>/g, config["table_prefix"]);
      query = query + " limit " + skip + ", " + limit;
      self.connection.query(query, function (error, rows, fields) {
        if (!error) {
          if (rows.length > 0) {
            self.saveterms(rows);
          }
          resolve();
        } else {
          errorLogger("error while exporting terms:", query);
          resolve(error);
        }
      });
    });
  },
  getAllterms: function (termscount) {
    var self = this;
    return when.promise(function (resolve, reject) {
      var _getterms = [];
      for (var i = 0, total = termscount; i < total; i += limit) {
        _getterms.push(
          (function (data) {
            return function () {
              return self.getterms(data);
            };
          })(i)
        );
      }
      var guardTask = guard.bind(null, guard.n(1));
      _getterms = _getterms.map(guardTask);
      var taskResults = parallel(_getterms);
      taskResults
        .then(function (results) {
          self.connection.end();
          resolve();
        })
        .catch(function (e) {
          errorLogger("something wrong while exporting terms:", e);
          reject(e);
        });
    });
  },
  start: function () {
    // successLogger("exporting terms...");
    var self = this;
    this.initalizeLoader();
    return when.promise(function (resolve, reject) {
      if (!filePath) {
        var count_query = termsCountQuery;
        count_query = count_query.replace(
          /<<tableprefix>>/g,
          config["table_prefix"]
        );
        self.connection.query(count_query, function (error, rows, fields) {
          if (!error) {
            var termscount = rows[0]["termscount"];
            if (termscount > 0) {
              self
                .getAllterms(termscount)
                .then(function () {
                  resolve();
                })
                .catch(function () {
                  reject();
                })
                .finally(function () {
                  self.destroyLoader();
                });
            } else {
              console.log(chalk.red("\nno terms found"));
              self.connection.end();
              resolve();
            }
          } else {
            console.log(chalk.red("\nfailed to get terms count: ", error));
            self.connection.end();
            reject(error);
          }
        });
      } else {
        if (fs.existsSync(filePath)) {
          termsids = fs.readFileSync(filePath, "utf-8").split(",");
        }
        if (termsids.length > 0) {
          self
            .getAllterms(termsids.length)
            .then(function () {
              resolve();
            })
            .catch(function () {
              reject();
            })
            .finally(function () {
              self.destroyLoader();
            });
        } else {
          resolve();
        }
      }
    });
  },
};

module.exports = ExtractTerms;
