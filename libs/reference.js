/**
 * External module Dependencies.
 */
var mkdirp = require("mkdirp"),
  path = require("path"),
  fs = require("fs"),
  when = require("when"),
  guard = require("when/guard"),
  parallel = require("when/parallel");

/**
 * Internal module Dependencies.
 */
var helper = require("../utils/helper");

var referenceConfig = config.modules.references,
  referenceids = [],
  limit = 100;
(referenceFolderPath = path.resolve(
  config.data,
  config.entryfolder,
  referenceConfig.dirName
)),
  (masterFolderPath = path.resolve(config.data, "master", config.entryfolder)),
  (referencesCountQuery =
    "SELECT count(<<tableprefix>>terms.term_id)as categorycount FROM <<tableprefix>>terms,<<tableprefix>>term_taxonomy WHERE <<tableprefix>>terms.term_id=<<tableprefix>>term_taxonomy.term_id AND  <<tableprefix>>term_taxonomy.taxonomy='category' ORDER BY <<tableprefix>>term_taxonomy.parent"),
  (referencesQuery =
    "SELECT <<tableprefix>>terms.term_id as ID,<<tableprefix>>terms.name,<<tableprefix>>terms.slug,<<tableprefix>>term_taxonomy.description,<<tableprefix>>term_taxonomy.parent FROM <<tableprefix>>terms,<<tableprefix>>term_taxonomy WHERE <<tableprefix>>terms.term_id=<<tableprefix>>term_taxonomy.term_id AND  <<tableprefix>>term_taxonomy.taxonomy='category' ORDER BY <<tableprefix>>term_taxonomy.parent"),
  (referencesByIDQuery =
    "SELECT <<tableprefix>>terms.term_id as ID,<<tableprefix>>terms.name,<<tableprefix>>terms.slug,<<tableprefix>>term_taxonomy.description,<<tableprefix>>term_taxonomy.parent FROM <<tableprefix>>terms,<<tableprefix>>term_taxonomy WHERE <<tableprefix>>terms.term_id=<<tableprefix>>term_taxonomy.term_id AND  <<tableprefix>>term_taxonomy.taxonomy='category' AND <<tableprefix>>terms.term_id IN <<catids>> ORDER BY <<tableprefix>>term_taxonomy.parent");

/**
 * Create folders and files
 */
if (!fs.existsSync(referenceFolderPath)) {
  mkdirp.sync(referenceFolderPath);
  helper.writeFile(path.join(referenceFolderPath, referenceConfig.fileName));
  mkdirp.sync(masterFolderPath);
  helper.writeFile(
    path.join(masterFolderPath, referenceConfig.masterfile),
    '{"en-us":{}}'
  );
}

function ExtractReferences() {
  this.connection = helper.connect();
}

ExtractReferences.prototype = {
  saveReferences: function (referenceDetails) {
    return when.promise(function (resolve, reject) {
      var referencedata = helper.readFile(
        path.join(referenceFolderPath, referenceConfig.fileName)
      );
      var referencemaster = helper.readFile(
        path.join(masterFolderPath, referenceConfig.masterfile)
      );
      referenceDetails.map(function (data, index) {
        var id = data["ID"];
        var slug = data["slug"];
        referencedata[`category_${id}`] = {
          uid: `category_${id}`,
          nicename: slug,
          _content_type_uid: "categories",
        };
        referencemaster["en-us"][slug] = "";
      });
      helper.writeFile(
        path.join(referenceFolderPath, referenceConfig.fileName),
        JSON.stringify(referencedata, null, 4)
      );
      helper.writeFile(
        path.join(masterFolderPath, referenceConfig.masterfile),
        JSON.stringify(referencemaster, null, 4)
      );
      resolve();
    });
  },
  getReferences: function (skip) {
    var self = this;
    return when.promise(function (resolve, reject) {
      var query;
      if (referenceids.length == 0) {
        query = referencesQuery; //Query for all references
      } else {
        query = referencesByIDQuery; //Query for caegories by id
        query = query.replace("<<catids>>", "(" + referenceids + ")");
      }
      query = query.replace(/<<tableprefix>>/g, config["table_prefix"]);
      query = query + " limit " + skip + ", " + limit;
      self.connection.query(query, function (error, rows, fields) {
        if (!error) {
          if (rows.length > 0) {
            self.saveReferences(rows);
          }
          resolve();
        } else {
          errorLogger("error while exporting references:", query);
          resolve(error);
        }
      });
    });
  },
  getAllReferences: function (categorycount) {
    var self = this;
    return when.promise(function (resolve, reject) {
      var _getReferences = [];
      for (var i = 0, total = categorycount; i < total; i += limit) {
        _getReferences.push(
          (function (data) {
            return function () {
              return self.getReferences(data);
            };
          })(i)
        );
      }
      var guardTask = guard.bind(null, guard.n(1));
      _getReferences = _getReferences.map(guardTask);
      var taskResults = parallel(_getReferences);
      taskResults
        .then(function (results) {
          self.connection.end();
          resolve();
        })
        .catch(function (e) {
          errorLogger("something wrong while exporting references:", e);
          reject(e);
        });
    });
  },
  start: function () {
    // successLogger("exporting references...");
    var self = this;
    return when.promise(function (resolve, reject) {
      if (!filePath) {
        var count_query = referencesCountQuery;
        count_query = count_query.replace(
          /<<tableprefix>>/g,
          config["table_prefix"]
        );
        self.connection.query(count_query, function (error, rows, fields) {
          if (!error) {
            var categorycount = rows[0]["categorycount"];
            if (categorycount > 0) {
              self
                .getAllReferences(categorycount)
                .then(function () {
                  resolve();
                })
                .catch(function () {
                  reject();
                });
            } else {
              // errorLogger("no references found");
              self.connection.end();
              resolve();
            }
          } else {
            errorLogger("failed to get references count: ", error);
            self.connection.end();
            reject(error);
          }
        });
      } else {
        if (fs.existsSync(filePath)) {
          referenceids = fs.readFileSync(filePath, "utf-8").split(",");
        }
        if (referenceids.length > 0) {
          self
            .getAllReferences(referenceids.length)
            .then(function () {
              resolve();
            })
            .catch(function () {
              reject();
            });
        } else {
          resolve();
        }
      }
    });
  },
};

module.exports = ExtractReferences;
