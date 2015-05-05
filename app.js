"use strict";

require("lugg").init();
var fs = require("fs");
var irc = require("irc-js");
var config = JSON.parse(fs.readFileSync("./config.json", "utf8"));
var twitch = require("twitch.tv");
var log = require("lugg")("app");
var redis = require("redis");
var url = require("url");
var _ = require("lodash");

var redisURL = url.parse(process.env.REDISCLOUD_URL || config.redisurl);
var client = redis.createClient(redisURL.port, redisURL.hostname, {no_ready_check: true});
client.auth(redisURL.auth.split(":")[1]);

var streamers = {};

var initialiseStreamers = function (args) {
  log.info("Initialising streamers");
  var streamerKeys = _.map(args, function (streamerName) { return "streamer:" + streamerName; });
  client.sadd("streamers", streamerKeys);
  _.each(streamerKeys, function (key) {
    if (!client.exists(key)) {
      client.hset(key, "live", false);
    }
  });
  log.info("Initialisation done");
};

var updateStreamersStatus = function (channel) {
  log.info("Updating...");
  twitch("streams?channel=" + config.channels, config.twitch, function (err, res) {
    if (err) {
      log.error("Something bad happened :(", err);
      return;
    }
    var streams = res.streams;
    var onlineStreamers = [];
    streams.forEach( function (stream) {
      var streamer = stream.channel.name;
      onlineStreamers.push(streamer);
      if (!client.hget("streamer:" + streamer, "live")) {
        log.info(streamer + " just went live!");
        channel.say(streamer + " began streaming " + stream.game + ", " + stream.channel.status + ": " + stream.channel.url);
      }
      client.hset("streamer:" + streamer, "live", true);
    });
    var offlineStremers = config.channels.filter(function(streamer) { return onlineStreamers.indexOf(streamer) < 0; });
    offlineStremers.forEach(function (streamer) {
      if (client.hget("streamer:" + streamer, "live")) {
        client.hset("streamer:" + streamer, "live", false);
      }
    });
    var streamers = client.smembers("streamers");
    var output = [];
    _.each(streamers, function (streamer) {
      output.push(client.dump(streamer));
    });
    log.debug(output);
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
    log.info("Joined #leftoutsidealone");
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
