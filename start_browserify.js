var browserify = require("browserify");
var babelify = require("babelify");

browserify("./JitsiMeetJS.js", {
    debug: true,
    standalone: "JitsiMeetJS"
}).transform(babelify.configure({
  ignore: [
      /\/node_modules\/(?!lib-jitsi-meet\/)/,
      "modules/RTC/adapter.screenshare.js"],
  presets: ["es2015"]
})).bundle().pipe(process.stdout);
