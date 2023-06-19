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

const cliProgress = require("cli-progress");
const colors = require("ansi-colors");
const chalk = require("chalk");
/**
 * Internal module Dependencies.
 */
var helper = require("../utils/helper");

var postConfig = config.modules.posts,
  permalink_structure = "",
  siteurl = "",
  limit = 100,
  postids = [],
  postFolderPath = path.resolve(
    config.data,
    config.entryfolder,
    postConfig.dirName
  ),
  assetfolderpath = path.resolve(config.data, config.modules.asset.dirName),
  masterFolderPath = path.resolve(config.data, "master", config.entryfolder),
  
  // postsCountQuery =
  //   "SELECT count(p.ID) as postcount FROM <<tableprefix>>posts p WHERE p.post_type='post' AND p.post_status='publish'",
    postsCountQuery =
      "SELECT COUNT(p.ID) AS postcount FROM <<tableprefix>>posts p WHERE p.post_type NOT IN ('page', 'wp_global_styles', 'wp_block') AND p.post_status IN ('publish', 'inherit')"
  postsQuery =
    "SELECT p.ID,p.post_author,u.user_login,p.post_title,p.post_name,p.guid,p.post_content,p.post_excerpt,p.post_date,p.post_date_gmt, (SELECT group_concat(<<tableprefix>>terms.slug) FROM <<tableprefix>>terms INNER JOIN <<tableprefix>>term_taxonomy on <<tableprefix>>terms.term_id = <<tableprefix>>term_taxonomy.term_id INNER JOIN <<tableprefix>>term_relationships wpr on wpr.term_taxonomy_id = <<tableprefix>>term_taxonomy.term_taxonomy_id WHERE taxonomy= 'category' and p.ID = wpr.object_id)AS post_category,p.post_author,u.user_login FROM <<tableprefix>>posts p LEFT JOIN <<tableprefix>>users u ON u.ID = p.post_author  WHERE p.post_type NOT IN ('page', 'wp_global_styles', 'wp_block') AND p.post_status IN ('publish', 'inherit') GROUP BY p.ID ORDER BY p.post_date desc",
  postsByIDQuery =
    "SELECT p.ID,p.post_author,u.user_login,p.post_title,p.post_name,p.guid,p.post_content,p.post_excerpt,p.post_date,p.post_date_gmt, (SELECT group_concat(<<tableprefix>>terms.slug) FROM <<tableprefix>>terms INNER JOIN <<tableprefix>>term_taxonomy on <<tableprefix>>terms.term_id = <<tableprefix>>term_taxonomy.term_id INNER JOIN <<tableprefix>>term_relationships wpr on wpr.term_taxonomy_id = <<tableprefix>>term_taxonomy.term_taxonomy_id WHERE taxonomy= 'category' and p.ID = wpr.object_id)AS post_category,p.post_author,u.user_login FROM <<tableprefix>>posts p LEFT JOIN <<tableprefix>>users u ON u.ID = p.post_author  WHERE p.post_type NOT IN ('page', 'wp_global_styles', 'wp_block') AND p.post_status IN ('publish', 'inherit') AND p.ID IN <<postids>> GROUP BY p.ID ORDER BY p.post_date desc",
  permalink_structureQuery =
    "SELECT option_value FROM <<tableprefix>>options WHERE option_name='permalink_structure'",
  siteURLQuery =
    "SELECT option_value FROM <<tableprefix>>options WHERE option_name='siteurl'";

mkdirp.sync(postFolderPath);
helper.writeFile(path.join(postFolderPath, postConfig.fileName));
mkdirp.sync(masterFolderPath);
helper.writeFile(
  path.join(masterFolderPath, postConfig.masterfile),
  '{"en-us":{}}'
);

function ExtractPosts() {
  this.connection = helper.connect();
  //Get the detail of permalink and siteurl
  var permalinkquery = permalink_structureQuery;
  permalinkquery = permalinkquery.replace(
    /<<tableprefix>>/g,
    config["table_prefix"]
  );
  this.connection.query(permalinkquery, function (error, rows, fields) {
    if (!error) {
      if (rows[0]["option_value"] && rows[0]["option_value"] != "")
        permalink_structure = rows[0]["option_value"];
    }
  });
  var siteurlquery = siteURLQuery;
  siteurlquery = siteurlquery.replace(
    /<<tableprefix>>/g,
    config["table_prefix"]
  );
  this.connection.query(siteurlquery, function (error, rows, fields) {
    if (!error) {
      siteurl = rows[0]["option_value"];
    }
  });
}

ExtractPosts.prototype = {
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
  getURL: function (post, guid, permalink_structure) {
    var lastslash = false;
    if (permalink_structure == "") {
      //This code for handle guid and  blog host from it
      var base = siteurl?.split("/");
      var len = base.length;
      var blogname;
      if (base[len - 1] == "") {
        blogname = base[len - 2];
      } else {
        blogname = base[len - 1];
      }
      var url = guid;
      var index = url.indexOf(blogname);
      url = url?.split(blogname);
      url = url[1];
      return url;
    } else {
      permalink_structure = permalink_structure?.split("/");
      if (permalink_structure[0] == "") permalink_structure.splice(0, 1);

      var len = permalink_structure.length;
      if (permalink_structure[len - 1] == "") {
        lastslash = true;
        permalink_structure.splice(len - 1, 1);
      }
      var posturl = "";

      permalink_structure.map(function (structure, index) {
        var date = new Date(post["post_date_gmt"]);
        if (structure == "%post_id%") {
          if (posturl.indexOf("/") == 0) posturl = posturl + post["ID"] + "/";
          else posturl = posturl + "/" + post["ID"] + "/";
        } else if (structure == "%year%") {
          if (posturl.indexOf("/") == 0)
            posturl = posturl + date.getFullYear() + "/";
          else posturl = posturl + "/" + date.getFullYear() + "/";
        } else if (structure == "%monthnum%") {
          var month = date.getMonth() + 1;
          if (month <= 9) month = "0" + month;

          if (posturl.indexOf("/") == 0) posturl = posturl + month + "/";
          else posturl = posturl + "/" + month + "/";
        } else if (structure == "%day%") {
          var day = date.getDate();
          if (day <= 9) day = "0" + day;

          if (posturl.indexOf("/") == 0) posturl = posturl + day + "/";
          else posturl = posturl + "/" + day + "/";
        } else if (structure == "%postname%") {
          if (posturl.indexOf("/") == 0)
            posturl = posturl + post["post_name"] + "/";
          else posturl = posturl + "/" + post["post_name"] + "/";
        } else {
          if (posturl.indexOf("/") == 0) posturl = posturl + structure + "/";
          else posturl = posturl + "/" + structure + "/";
        }
      });
      /*var index=posturl.lastIndexOf("/");
            posturl=posturl.substring(0,index)*/
      //above two commented lines to remoce last slash from url if we don't want
      if (!lastslash) {
        //this condition is to check wheather url structure having last slash or not
        //posturl=siteurl+posturl
        return posturl;
      }
      //return siteurl+posturl  //send absolute url of post
      return posturl; //only relative url will be save
    }
  },
  savePosts: function (postsDetails) {
    var self = this;
    return when.promise(function (resolve, reject) {
      self.customBar.start(postsDetails.length, 0, {
        title: "Migrating Posts      ",
      });
      var authorId = helper.readFile(
        path.join(process.cwd(), "csMigrationData","entries","authors","en-us.json")
      );

      var categoryId = helper.readFile(
        path.join(
          process.cwd(),
          "csMigrationData","entries","categories","en-us.json"
        )
      );

      var postdata = helper.readFile(
        path.join(postFolderPath, postConfig.fileName)
      );
      var postmaster = helper.readFile(
        path.join(masterFolderPath, postConfig.masterfile)
      );
      // let image = [];
      // var featuredImage = helper.readFile(
      //   path.join(assetfolderpath, config.modules.asset.featuredfileName)
      // );
      var assetsId = helper.readFile(
        path.join(assetfolderpath, config.modules.asset.fileName)
      );
      // const iterator = Object.values(featuredImage).values();
      // for (const value of iterator) {
      //   Object.values(assetsId).forEach((key) => {
      //     if (key.uid === `assets_${value}`) {
      //       image.push(assetsId[`assets_${value}`]); // to push the key which we got from match
      //     }
      //   });
      // }
      postsDetails.map(function (data, index) {
        var postAuthor = [],
          postcategories = [];
        // to match id with Author

        const authIterator = data["user_login"] ? data["user_login"]?.split(",") : '';
        for (const value of authIterator) {
          Object.values(authorId).forEach((key) => {
            if (value === key.title) {
              postAuthor.push({
                uid: `${key.uid}`,
                _content_type_uid: "authors",
              });
            }
          });
        }

        // to match id with categories
        const catIterator = data["post_category"] !== null ?  Object.values(data["post_category"]?.split(",")) : '';
        for (const value of catIterator) {
          Object.values(categoryId).forEach((key) => {
            if (value === key.nicename) {
              postcategories.push({
                uid: `${key.uid}`,
                _content_type_uid: "categories",
              });
            }
          });
        }

        // for HTML RTE to JSON RTE convert
        const dom = new JSDOM(
          data["post_content"]
            .replace(/<!--.*?-->/g, "")
            .replace(/&lt;!--?\s+\/?wp:.*?--&gt;/g, "")
            .replace(/<\/?fragment*?>/g, "")
        );
        let htmlDoc = dom.window.document.querySelector("body");
        const jsonValue = htmlToJson(htmlDoc);
        var guid = "/" + data["guid"].replace(/^(?:\/\/|[^\/]+)*\//, "");
        postdata[`posts_${data["ID"]}`] = {
          title: data["post_title"],
          uid: `posts_${data["ID"]}`,
          url: self.getURL(data, guid, permalink_structure),
          author: postAuthor,
          category: postcategories,
          date: data["post_date_gmt"].toISOString(),
          full_description: jsonValue,
          excerpt: data["post_excerpt"]
            .replace(/<!--.*?-->/g, "")
            .replace(/&lt;!--?\s+\/?wp:.*?--&gt;/g, ""),
        };
        // if (featuredImage) {
        //   postdata[data["ID"]]["featured_image"] = image[data["ID"]];
        // } else {
        //   postdata[data["ID"]]["featured_image"] = "";
        // }
        postmaster["en-us"][data[`posts_${data["ID"]}`]] = "";
        self.customBar.increment();
      });
      helper.writeFile(
        path.join(postFolderPath, postConfig.fileName),
        JSON.stringify(postdata, null, 4)
      );
      helper.writeFile(
        path.join(masterFolderPath, postConfig.masterfile),
        JSON.stringify(postmaster, null, 4)
      );

      resolve();
    });
  },
  getPosts: function (skip) {
    var self = this;
    return when.promise(function (resolve, reject) {
      var query;
      if (postids.length == 0) query = postsQuery;
      //Query for all posts
      else {
        query = postsByIDQuery; //Query for posts by id
        query = query.replace("<<postids>>", "(" + postids + ")");
      }
      query = query.replace(/<<tableprefix>>/g, config["table_prefix"]);
      query = query + " limit " + skip + ", " + limit;
      self.connection.query(query, function (error, rows, fields) {
        if (!error) {
          if (rows.length > 0) {
            self.savePosts(rows);
            resolve();
          } else {
            // errorLogger("no posts found");
            resolve();
          }
        } else {
          errorLogger("error while exporting posts:", query);
          resolve(error);
        }
      });
    });
  },
  getAllPosts: function (postCount) {
    var self = this;
    return when.promise(function (resolve, reject) {
      var _getPosts = [];
      for (var i = 0, total = postCount; i < total; i += limit) {
        _getPosts.push(
          (function (data) {
            return function () {
              return self.getPosts(data);
            };
          })(i)
        );
      }
      var guardTask = guard.bind(null, guard.n(1));
      _getPosts = _getPosts.map(guardTask);
      var taskResults = parallel(_getPosts);
      taskResults
        .then(function (results) {
          self.connection.end();
          resolve();
        })
        .catch(function (e) {
          errorLogger("something wrong while exporting posts:", e);
          reject(e);
        });
    });
  },
  start: function () {
    // successLogger("exporting posts...");
    var self = this;
    this.initalizeLoader();
    return when.promise(function (resolve, reject) {
      if (!filePath) {
        var count_query = postsCountQuery;
        count_query = count_query.replace(
          /<<tableprefix>>/g,
          config["table_prefix"]
        );
        self.connection.query(count_query, function (error, rows, fields) {
          if (!error) {
            var postcount = rows[0]["postcount"];
            if (postcount > 0) {
              self
                .getAllPosts(postcount)
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
              console.log(chalk.red("\nno posts found"));
              self.connection.end();
              resolve();
            }
          } else {
            console.log(chalk.red("\nfailed to get posts count: ", error));
            self.connection.end();
            reject(error);
          }
        });
      } else {
        if (fs.existsSync(filePath)) {
          postids = fs.readFileSync(filePath, "utf-8")?.split(",");
        }
        if (postids.length > 0) {
          self
            .getAllPosts(postids.length)
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

module.exports = ExtractPosts;
