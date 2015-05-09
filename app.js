"use strict";

require("lugg").init();
var fs = require("fs");
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
  log.info("Initialising streamers");
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

var streamerLiveStatus = function (streamer, cb) {
  redisClient.hget("streamer:" + streamer, "live", function (err, status) {
    cb(typeof status === "boolean" ? status : status === "true");
  });
};

var updateStreamersStatus = function (channel) {
  log.info("Updating...");
  twitch("streams?channel=" + config.channels, config.twitch, function (err, res) {
    if (err) {
      log.error("Something bad happened :(", err);
      return;
    }
    log.debug("Online channels response: ", res);

    var streams = res.streams;
    log.debug("Online channels streams: ", streams);
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
        redisClient.hset("streamer:" + streamer, "live", true);
      });
    });

    var offlineStreamers = channels.filter(function(streamer) { return onlineStreamers.indexOf(streamer) < 0; });
    log.debug("Offline streamers:", offlineStreamers);
    _.each(offlineStreamers, function (streamer) {
        redisClient.hset("streamer:" + streamer, "live", false);
    });

    log.debug("Streamers:", channels);
    _.each(channels, function (streamer) {
      redisClient.hgetall("streamer:"+streamer, function (err, results) {
        log.debug("Streamer output:", streamer, results);
      });
    });
  });
};

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
bot.match("INVITE", function(msg) {
  msg.reply("Joining.");
  bot.join(msg.params[1]);
});

bot.match(/.*/, function(msg) {
  log.debug(msg.from, msg.params);
});
