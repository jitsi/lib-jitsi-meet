import { stripXMLInvalidChars } from './XMLUtils';

describe('stripXMLInvalidChars', () => {
    it('strips the XML-invalid C0 control characters', () => {
        // U+0000 - U+0008, U+000B, U+000C, U+000E - U+001F
        expect(stripXMLInvalidChars('\u0000\u0001\u0002\u0007\u0008\u000B\u000C\u000E\u001F')).toBe('');
        expect(stripXMLInvalidChars('a\u0000b\u000Bc\u000Cd\u001Fe')).toBe('abcde');
    });

    it('preserves the XML-valid whitespace characters', () => {
        expect(stripXMLInvalidChars('\u0009\u000A\u000D')).toBe('\u0009\u000A\u000D');
        expect(stripXMLInvalidChars('line1\tline2\nline3\rline4')).toBe('line1\tline2\nline3\rline4');
    });

    it('strips the non-characters U+FFFE and U+FFFF', () => {
        expect(stripXMLInvalidChars('a\uFFFEb\uFFFFc')).toBe('abc');
    });

    it('strips lone surrogates', () => {
        expect(stripXMLInvalidChars('a\uD800b\uDFFFc')).toBe('abc');
    });

    it('preserves astral characters encoded as surrogate pairs', () => {
        expect(stripXMLInvalidChars('emoji 😀 is fine')).toBe('emoji 😀 is fine');
        expect(stripXMLInvalidChars('\u{1F600}')).toBe('\u{1F600}');
    });

    it('preserves characters in the valid XML ranges', () => {
        expect(stripXMLInvalidChars('Hello, world! 123')).toBe('Hello, world! 123');
        // Boundary checks for the allowed ranges: U+20, U+D7FF, U+E000, U+FFFD
        expect(stripXMLInvalidChars('\u0020\uD7FF\uE000\uFFFD')).toBe('\u0020\uD7FF\uE000\uFFFD');
    });

    it('handles the empty string', () => {
        expect(stripXMLInvalidChars('')).toBe('');
    });
});
