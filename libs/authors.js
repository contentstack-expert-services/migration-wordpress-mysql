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
const { JSDOM } = require("jsdom");
const { htmlToJson } = require("@contentstack/json-rte-serializer");
/**
 * Internal module Dependencies.
 */
var helper = require("../utils/helper");

var authorConfig = config.modules.authors,
  authorids = [],
  limit = 100,
  authorsFolderPath = path.resolve(
    config.data,
    config.entryfolder,
    authorConfig.dirName
  ),
  masterFolderPath = path.resolve(config.data, "master", config.entryfolder),
  authorsCountQuery =
    "SELECT count(users.ID) as usercount FROM <<tableprefix>>users users INNER JOIN <<tableprefix>>usermeta usermetafirstname ON usermetafirstname.user_id= users.ID AND usermetafirstname.meta_key = 'first_name' INNER JOIN <<tableprefix>>usermeta usermetalastname ON usermetalastname.user_id = users.ID AND usermetalastname.meta_key = 'last_name' INNER JOIN <<tableprefix>>usermeta usermetadescription ON usermetadescription.user_id = users.ID AND usermetadescription.meta_key = 'description'",
  authorsQuery =
    "SELECT users.ID,users.user_login,users.user_email,usermetafirstname.meta_value AS first_name, usermetalastname.meta_value as last_name,usermetadescription.meta_value as description FROM <<tableprefix>>users users INNER JOIN <<tableprefix>>usermeta usermetafirstname ON usermetafirstname.user_id= users.ID AND usermetafirstname.meta_key = 'first_name' INNER JOIN <<tableprefix>>usermeta usermetalastname ON usermetalastname.user_id = users.ID AND usermetalastname.meta_key = 'last_name' INNER JOIN <<tableprefix>>usermeta usermetadescription ON usermetadescription.user_id = users.ID AND usermetadescription.meta_key = 'description'",
  authorsByIDQuery =
    "SELECT users.ID,users.user_login,users.user_email,usermetafirstname.meta_value AS first_name, usermetalastname.meta_value as last_name,usermetadescription.meta_value as description FROM <<tableprefix>>users users INNER JOIN <<tableprefix>>usermeta usermetafirstname ON usermetafirstname.user_id= users.ID AND usermetafirstname.meta_key = 'first_name' INNER JOIN <<tableprefix>>usermeta usermetalastname ON usermetalastname.user_id = users.ID AND usermetalastname.meta_key = 'last_name' INNER JOIN <<tableprefix>>usermeta usermetadescription ON usermetadescription.user_id = users.ID AND usermetadescription.meta_key = 'description' WHERE users.ID IN ";

/**
 * Create folders and files
 */
if (!fs.existsSync(authorsFolderPath)) {
  mkdirp.sync(authorsFolderPath);
  helper.writeFile(path.join(authorsFolderPath, authorConfig.fileName));
  mkdirp.sync(masterFolderPath);
  helper.writeFile(
    path.join(masterFolderPath, authorConfig.masterfile),
    '{"en-us":{}}'
  );
}

function ExtractAuthors() {
  this.connection = helper.connect();
}

ExtractAuthors.prototype = {
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
  saveAuthors: function (authorDetails) {
    var self = this;
    return when.promise(function (resolve, reject) {
      self.customBar.start(authorDetails.length, 0, {
        title: "Migrating Authors    ",
      });
      var slugRegExp = new RegExp("[^a-z0-9_-]+", "g");
      var authordata = helper.readFile(
        path.join(authorsFolderPath, authorConfig.fileName)
      );
      var authormaster = helper.readFile(
        path.join(masterFolderPath, authorConfig.masterfile)
      );
      authorDetails.map(function (data, index) {
        var description = data["description"] || "";

        // for HTML RTE to JSON RTE convert
        const dom = new JSDOM(description.replace(/&amp;/g, "&"));
        let htmlDoc = dom.window.document.querySelector("body");
        const jsonValue = htmlToJson(htmlDoc);
        description = jsonValue;

        authordata[`authors_${data["ID"]}`] = {
          uid: `authors_${data["ID"]}`,
          title: data["user_login"],
          url: `/author/${data["ID"]}`,
          email: data["user_email"],
          first_name: data["first_name"],
          last_name: data["last_name"],
          biographical_info: description,
        };
        authormaster["en-us"][data["user_login"]] = "";
        self.customBar.increment();
      });

      helper.writeFile(
        path.join(authorsFolderPath, authorConfig.fileName),
        JSON.stringify(authordata, null, 4)
      );
      helper.writeFile(
        path.join(masterFolderPath, authorConfig.masterfile),
        JSON.stringify(authormaster, null, 4)
      );
      resolve();
    });
  },
  getAuthors: function (skip) {
    var self = this;
    return when.promise(function (resolve, reject) {
      var query;
      if (authorids.length == 0) query = authorsQuery;
      else query = authorsByIDQuery + "(" + authorids + ")"; //Query for authors by id

      query = query.replace(/<<tableprefix>>/g, config["table_prefix"]);
      query = query + " limit " + skip + ", " + limit;
      self.connection.query(query, function (error, rows, fields) {
        if (!error) {
          if (rows.length > 0) {
            self.saveAuthors(rows);
          }
          resolve();
        } else {
          errorLogger("error while exporting authors:", query);
          resolve(error);
        }
      });
    });
  },
  getAllAuthors: function (usercount) {
    var self = this;
    return when.promise(function (resolve, reject) {
      var _getAuthors = [];
      for (var i = 0, total = usercount; i < total; i += limit) {
        _getAuthors.push(
          (function (data) {
            return function () {
              return self.getAuthors(data);
            };
          })(i)
        );
      }
      var guardTask = guard.bind(null, guard.n(1));
      _getAuthors = _getAuthors.map(guardTask);
      var taskResults = parallel(_getAuthors);
      taskResults
        .then(function (results) {
          self.connection.end();
          resolve();
        })
        .catch(function (e) {
          errorLogger("something wrong while exporting authors:", e);
          reject(e);
        });
    });
  },
  start: function () {
    // successLogger("exporting authors...");
    var self = this;
    this.initalizeLoader();
    return when.promise(function (resolve, reject) {
      if (!filePath) {
        var count_query = authorsCountQuery;
        count_query = count_query.replace(
          /<<tableprefix>>/g,
          config["table_prefix"]
        );
        self.connection.query(count_query, function (error, rows, fields) {
          if (!error) {
            var usercount = rows[0]["usercount"];
            if (usercount > 0) {
              self
                .getAllAuthors(usercount)
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
              console.log(chalk.red("\nno authors uid found"));
              self.connection.end();
              resolve();
            }
          } else {
            console.log(chalk.red("\nfailed to get authors count: ", error));
            self.connection.end();
            reject(error);
          }
        });
      } else {
        if (fs.existsSync(filePath)) {
          authorids = fs.readFileSync(filePath, "utf-8").split(",");
        }
        if (authorids.length > 0) {
          self
            .getAllAuthors(authorids.length)
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

module.exports = ExtractAuthors;
