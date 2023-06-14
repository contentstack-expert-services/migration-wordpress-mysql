var path = require("path"),
  chalk = require("chalk"),
  fs = require("fs"),
  inquirer = require("inquirer"),
  mysql = require("mysql"),
  sequence = require("when/sequence"),
  helper = require("./utils/helper");

_ = require("lodash");
const Messages = require("./utils/message");
const { log } = require("console");
const messages = new Messages("wordpress").msgs;

config = require("./config");
global.errorLogger = require("./utils/logger")("error").error;
global.successLogger = require("./utils/logger")("success").log;
global.warnLogger = require("./utils/logger")("warn").log;

var modulesList = [
  "reference",
  "authors",
  "categories",
  "assets",
  "posts",
  "terms",
];
var contentList = ["authors", "categories", "posts", "terms", "tags"];
var _export = [];

const migration = () => {
  const connection = mysql.createConnection({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
  });
  connection.connect((err) => {
    if (err) {
      console.log(err)
      console.log(chalk.red("Cannot connect to database please try again!"));
      MySqlMigration();
    } else {
      console.log(chalk.green("Connected to database"));

      global.filePath = undefined;

      // Module List for Entries
      for (var i = 0, total = modulesList.length; i < total; i++) {
        var ModuleExport = require("./libs/" + modulesList[i] + ".js");
        var moduleExport = new ModuleExport();
        _export.push(
          (function (moduleExport) {
            return function () {
              return moduleExport.start();
            };
          })(moduleExport)
        );
      }

      // create schema for the entries we  have created
      for (var i = 0, total = contentList.length; i < total; i++) {
        var ContentExport = require("./content_types/" +
          contentList[i] +
          ".js");
        var contentExport = new ContentExport();
        _export.push(
          (function (contentExport) {
            return function () {
              return contentExport.start();
            };
          })(contentExport)
        );
      }

      var taskResults = sequence(_export);

      taskResults
        .then(async function (results) {
          successLogger("Data exporting has been completed");
        })
        .catch(function (error) {
          errorLogger(error);
        });
    }
  });
};

const MySqlMigration = async () => {
  console.log(chalk.hex("#6C5CE7")(messages.promptMySqlDescription));

  const question = [
    {
      type: "input",
      name: "csHostName",
      message: messages.promptHostName,
      validate: (csHostName) => {
        if (!csHostName || csHostName.trim() === "") {
          console.log(chalk.red("Please insert Hostname!"));
          return false;
        }
        this.name = csHostName;
        return true;
      },
    },
    {
      type: "input",
      name: "csUserName",
      message: messages.promptUserName,
      validate: (csUserName) => {
        if (!csUserName || csUserName.trim() === "") {
          console.log(chalk.red("Please insert Username!"));
          return false;
        }
        this.name = csUserName;
        return true;
      },
    },
    {
      type: "password",
      name: "csPassword",
      message: messages.promptPassword,
    },
    {
      type: "number",
      name: "csPort",
      message: messages.promptPortNo,
      default: 3306,
    },
    {
      type: "input",
      name: "csDataBase",
      message: messages.promptDataBase,
      validate: (csDataBase) => {
        if (!csDataBase || csDataBase.trim() === "") {
          console.log(chalk.red("Please insert Database name!"));
          return false;
        }
        this.name = csDataBase;
        return true;
      },
    },
  ];

  // inquirer.prompt(question).then(async (answer) => {
    try {
      // configuring the details to config file
      // global.config.mysql.host = `${answer.csHostName}`;
      // global.config.mysql.user = `${answer.csUserName}`;
      // global.config.mysql.password = `${answer.csPassword}`;
      // global.config.mysql.port = `${answer.csPort}`;
      // global.config.mysql.database = `${answer.csDataBase}`;

      migration();
    } catch (error) {
      console.log(chalk.red(error.message));
    }
  // });
};

module.exports = MySqlMigration();
