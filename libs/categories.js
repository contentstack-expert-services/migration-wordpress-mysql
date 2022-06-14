/**
 * External module Dependencies.
 */
var mkdirp = require("mkdirp"),
  path = require("path"),
  fs = require("fs"),
  when = require("when"),
  guard = require("when/guard"),
  parallel = require("when/parallel");
const { JSDOM } = require("jsdom");
const { htmlToJson } = require("@contentstack/json-rte-serializer");

const chalk = require("chalk");
const cliProgress = require("cli-progress");
const colors = require("ansi-colors");

/**
 * Internal module Dependencies.
 */
var helper = require("../utils/helper");

var categoryConfig = config.modules.categories,
  categoryids = [],
  limit = 100;
(categoryFolderPath = path.resolve(
  config.data,
  config.entryfolder,
  categoryConfig.dirName
)),
  (masterFolderPath = path.resolve(config.data, "master", config.entryfolder)),
  (categoriesCountQuery =
    "SELECT count(<<tableprefix>>terms.term_id)as categorycount FROM <<tableprefix>>terms,<<tableprefix>>term_taxonomy WHERE <<tableprefix>>terms.term_id=<<tableprefix>>term_taxonomy.term_id AND  <<tableprefix>>term_taxonomy.taxonomy='category' ORDER BY <<tableprefix>>term_taxonomy.parent"),
  (categoriesQuery =
    "SELECT <<tableprefix>>terms.term_id as ID,<<tableprefix>>terms.name,<<tableprefix>>terms.slug,<<tableprefix>>term_taxonomy.description,<<tableprefix>>term_taxonomy.parent FROM <<tableprefix>>terms,<<tableprefix>>term_taxonomy WHERE <<tableprefix>>terms.term_id=<<tableprefix>>term_taxonomy.term_id AND  <<tableprefix>>term_taxonomy.taxonomy='category' ORDER BY <<tableprefix>>term_taxonomy.parent"),
  (categoriesByIDQuery =
    "SELECT <<tableprefix>>terms.term_id as ID,<<tableprefix>>terms.name,<<tableprefix>>terms.slug,<<tableprefix>>term_taxonomy.description,<<tableprefix>>term_taxonomy.parent FROM <<tableprefix>>terms,<<tableprefix>>term_taxonomy WHERE <<tableprefix>>terms.term_id=<<tableprefix>>term_taxonomy.term_id AND  <<tableprefix>>term_taxonomy.taxonomy='category' AND <<tableprefix>>terms.term_id IN <<catids>> ORDER BY <<tableprefix>>term_taxonomy.parent");

/**
 * Create folders and files
 */
if (!fs.existsSync(categoryFolderPath)) {
  mkdirp.sync(categoryFolderPath);
  helper.writeFile(path.join(categoryFolderPath, categoryConfig.fileName));
  mkdirp.sync(masterFolderPath);
  helper.writeFile(
    path.join(masterFolderPath, categoryConfig.masterfile),
    '{"en-us":{}}'
  );
}

function ExtractCategories() {
  this.connection = helper.connect();
}

ExtractCategories.prototype = {
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
  saveCategories: function (categoryDetails) {
    var self = this;
    return when.promise(function (resolve, reject) {
      self.customBar.start(categoryDetails.length, 0, {
        title: "Migrating Categories ",
      });
      var slugRegExp = new RegExp("[^a-z0-9_-]+", "g");
      var categorydata = helper.readFile(
        path.join(categoryFolderPath, categoryConfig.fileName)
      );
      var categorymaster = helper.readFile(
        path.join(masterFolderPath, categoryConfig.masterfile)
      );

      categoryDetails.map(function (data, index) {
        var title = data["name"];
        title = title.replace(/&amp;/g, "&");
        var id = data["ID"];
        var slug = data["slug"];

        var description = data["description"] || "";

        // for HTML RTE to JSON RTE convert
        const dom = new JSDOM(description.replace(/&amp;/g, "&"));
        let htmlDoc = dom.window.document.querySelector("body");
        const jsonValue = htmlToJson(htmlDoc);
        description = jsonValue;

        var parent = {
          uid: `category_${data["parent"]}`,
          _content_type_uid: "categories",
        };

        if (parent.uid === "category_0") {
          parent = "";
        }

        categorydata[`category_${id}`] = {
          uid: `category_${id}`,
          title: title.charAt(0).toUpperCase() + title.slice(1),
          url: `/category/${id}`,
          nicename: slug,
          description: description,
          parent: [parent],
        };
        categorymaster["en-us"][slug] = "";
        self.customBar.increment();
      });
      helper.writeFile(
        path.join(categoryFolderPath, categoryConfig.fileName),
        JSON.stringify(categorydata, null, 4)
      );
      helper.writeFile(
        path.join(masterFolderPath, categoryConfig.masterfile),
        JSON.stringify(categorymaster, null, 4)
      );
      resolve();
    });
  },
  getCategories: function (skip) {
    var self = this;
    return when.promise(function (resolve, reject) {
      var query;
      if (categoryids.length == 0) {
        query = categoriesQuery; //Query for all categories
      } else {
        query = categoriesByIDQuery; //Query for caegories by id
        query = query.replace("<<catids>>", "(" + categoryids + ")");
      }
      query = query.replace(/<<tableprefix>>/g, config["table_prefix"]);
      query = query + " limit " + skip + ", " + limit;
      self.connection.query(query, function (error, rows, fields) {
        if (!error) {
          if (rows.length > 0) {
            self.saveCategories(rows);
          }
          resolve();
        } else {
          errorLogger("error while exporting categories:", query);
          resolve(error);
        }
      });
    });
  },
  getAllCategories: function (categorycount) {
    var self = this;
    return when.promise(function (resolve, reject) {
      var _getCategories = [];
      for (var i = 0, total = categorycount; i < total; i += limit) {
        _getCategories.push(
          (function (data) {
            return function () {
              return self.getCategories(data);
            };
          })(i)
        );
      }
      var guardTask = guard.bind(null, guard.n(1));
      _getCategories = _getCategories.map(guardTask);
      var taskResults = parallel(_getCategories);
      taskResults
        .then(function (results) {
          self.connection.end();
          resolve();
        })
        .catch(function (e) {
          errorLogger("something wrong while exporting categories:", e);
          reject(e);
        });
    });
  },
  start: function () {
    var self = this;
    this.initalizeLoader();
    return when.promise(function (resolve, reject) {
      if (!filePath) {
        var count_query = categoriesCountQuery;
        count_query = count_query.replace(
          /<<tableprefix>>/g,
          config["table_prefix"]
        );
        self.connection.query(count_query, function (error, rows, fields) {
          if (!error) {
            var categorycount = rows[0]["categorycount"];
            if (categorycount > 0) {
              self
                .getAllCategories(categorycount)
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
              console.log(chalk.red("\nno categories found"));
              self.connection.end();
              resolve();
            }
          } else {
            console.log(chalk.red("\nfailed to get categories count: ", error));
            errorLogger();
            self.connection.end();
            reject(error);
          }
        });
      } else {
        if (fs.existsSync(filePath)) {
          categoryids = fs.readFileSync(filePath, "utf-8").split(",");
        }
        if (categoryids.length > 0) {
          self
            .getAllCategories(categoryids.length)
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

module.exports = ExtractCategories;
