"use strict";

require("lugg").init();
var irc = require("irc-js");
var config = require("config");
var twitch = require("twitch.tv");
var log = require("lugg")("app");
var redis = require("redis");
var url = require("url");
var _ = require("lodash");

var redisURL = url.parse(process.env.REDISCLOUD_URL || config.redisurl);
var redisClient = redis.createClient(redisURL.port, redisURL.hostname, {no_ready_check: true});
redisClient.auth(redisURL.auth.split(":")[1]);
var channels = [];

var initialiseStreamers = function (args) {
  if (args.length === 0) { return; }
  log.info("Initialising streamers: ", args);
  var streamerKeys = _.map(args, function (streamerName) { return "streamer:" + streamerName; });
  redisClient.sadd("streamers", streamerKeys);
  _.each(streamerKeys, function (key) {
    redisClient.exists(key, function(err, result) {
      if (!result) {
        redisClient.hset(key, "live", false);
      }
    });
  });
  redisClient.smembers("streamers", function (err, streamers) {
    channels = _.map(streamers, function (streamer) { return streamer.split(":")[1]; });
    log.info("Channels:", channels);
  });
  log.info("Initialisation done");
};

var removeStreamers = function (args) {
  if (args.length === 0) { return; }
  log.info("Removing streamers: ", args);
  var streamerKeys = _.map(args, function (streamerName) { return "streamer:" + streamerName; });
  redisClient.srem("streamers", streamerKeys);
  redisClient.del(streamerKeys);
}

var streamerLiveStatus = function (streamer, cb) {
  redisClient.hget("streamer:" + streamer, "live", function (err, status) {
    cb(typeof status === "boolean" ? status : status === "true");
  });
};

var reportStreamerStatus = function (cb) {
  log.debug("Streamers:", channels);
  _.each(channels, function (streamer) {
    redisClient.hgetall("streamer:"+streamer, function (err, results) {
      log.debug("Streamer output:", streamer, results);
      var status = "offline",
        info = "";
      if (typeof results.live === "boolean" ? results.live : results.live === "true") {
          status = "live";
          info = ", playing '" + results.game + "' with title '" + results.title + "', " + results.url;
      }

      if (typeof cb === "undefined") {
      } else {
        cb("Channel: " + streamer + ", " + status + info);
      }
    });
  });
};

var updateStreamersStatus = function (channel) {
  log.info("Updating streams status");
  twitch("streams?channel=" + config.channels, config.twitch, function (err, res) {
    if (err) {
      log.error("Something bad happened :(", err);
      return;
    }
    log.debug("Online channels response:", res);

    var streams = res.streams;
    log.debug("Online channels streams:", streams);
    var onlineStreamers = [];
    _.each(streams, function (stream) {
      var streamer = stream.channel.name;
      onlineStreamers.push(streamer);
      streamerLiveStatus(streamer, function (status) {
        log.debug("Streamer live status:", streamer, status);
        if (!status) {
          log.info(streamer + " just went live!");
          channel.say(streamer + " began streaming '" + stream.game + "', " + stream.channel.status + ": " + stream.channel.url);
        }
        redisClient.hmset("streamer:" + streamer, "live", true, "game", stream.game, "title", stream.channel.status, "url", stream.channel.url);
      });
    });

    var offlineStreamers = channels.filter(function(streamer) { return onlineStreamers.indexOf(streamer) < 0; });
    log.debug("Offline streamers:", offlineStreamers);
    _.each(offlineStreamers, function (streamer) {
        redisClient.hmset("streamer:" + streamer, "live", false, "game", null, "title", null);
    });

    reportStreamerStatus(log.info.bind(log));
  });
};

var botCommands = {};
var botHelp = {};

var initBotCommand = function (cmdName, cmdFunction, cmdHelp) {
    botCommands[cmdName] = cmdFunction;
    botHelp[cmdName] = cmdHelp;
}

initBotCommand('help', function (args, cb) {
  var argArr = [];
  if (args instanceof String || typeof args === "string") {
    argArr = args.split(" ");
  } else if (args instanceof Array) {
    argArr = args;
  }
  _.each(argArr, function (arg) {
    cb(botHelp[arg])
  });

  if (argArr.length === 0) {
    cb("All available commands: " + _.map(Object.keys(botHelp), function (cmd) { return "§"+cmd; }).join(", "));
  }
}, "Provides help about the bot and its commands.");

initBotCommand('streams', function (args, cb) {
  var argArr = [];
  if (args instanceof String || typeof args === "string") {
    argArr = args.split(" ");
  } else if (args instanceof Array) {
    argArr = args;
  }

  log.debug("Streams arguments", argArr);
  switch (argArr.shift()) {
    case "add":
      initialiseStreamers(argArr);
      break;
    case "del":
      removeStreamers(argArr);
      break;
    default:
      reportStreamerStatus(cb);
  }
}, "Lists channel statuses when called without arguments. Otherwise accepts 'add' or 'del' with one or more channel names.");

var bot = new irc.Client(config.irc);
initialiseStreamers(config.channels);
log.info("Connecting to IRC");
bot.connect(function (client) {
  log.info("loaxor connected");
  client.join(config.irc.channel, function (err, channel) {
    if (err) {
      log.error("Could not join channel :(", err);
      return;
    }
    log.info("Joined " + channel.name);
    updateStreamersStatus(channel);
    setInterval(updateStreamersStatus, 30000, channel);
  });
});

bot.match("INVITE", function (msg) {
  msg.reply("Joining.");
  bot.join(msg.params[1]);
});

_.each(Object.keys(botCommands), function (botCmd) {
  var re = new RegExp("§" + botCmd + "(?: (.*))*");
  bot.match(re, function (msg, args) {
    log.debug(botCmd, msg.client.user, msg.from, msg.params, args);
    botCommands[botCmd](args, msg.reply.bind(msg));
  });

});

process.on("uncaughtException", function (err) {
  log.error(err);
  if (err.message.indexOf("Property ") === -1 || err.message.indexOf(" is not a function") === -1) {
    throw err;
  }
});
