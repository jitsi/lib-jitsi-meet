var SDPUtil = require("./SDPUtil.js");

describe("SDPUtil", function() {

    it("should parse an ice ufrag correctly", function() {
        let line = "a=ice-ufrag:3jlcc1b3j1rqt6";
        let parsed = SDPUtil.parse_iceufrag(line);

        expect(parsed).toEqual("3jlcc1b3j1rqt6");
    });
});
