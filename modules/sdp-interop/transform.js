/* Copyright @ 2015 - Present, 8x8 Inc
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import transform from 'sdp-transform';

/**
 * Rewrites the source information in the way sdp-transform expects.
 * Source information is split into multiple ssrc objects each containing
 * an id, attribute and value.
 * @param {Object} media - media description to be modified.
 * @returns {void}
 */
const write = function(session, opts) {
    if (typeof session !== 'undefined' && typeof session.media !== 'undefined' && Array.isArray(session.media)) {
        session.media.forEach(mLine => {
            if (mLine.sources && mLine.sources.length) {
                mLine.ssrcs = [];
                mLine.sources.forEach(source => {
                    Object.keys(source).forEach(attribute => {
                        if (attribute === 'id') {
                            return;
                        }
                        mLine.ssrcs.push({
                            id: source.id,
                            attribute,
                            value: source[attribute]
                        });
                    });
                });
                delete mLine.sources;
            }

            // join ssrcs in ssrc groups
            if (mLine.ssrcGroups && mLine.ssrcGroups.length) {
                mLine.ssrcGroups.forEach(ssrcGroup => {
                    if (typeof ssrcGroup.ssrcs !== 'undefined'
                    && Array.isArray(ssrcGroup.ssrcs)) {
                        ssrcGroup.ssrcs = ssrcGroup.ssrcs.join(' ');
                    }
                });
            }
        });
    }

    return transform.write(session, opts);
};

/**
 * Rewrites the source information that we get from sdp-transform.
 * All the ssrc lines with different attributes that belong to the
 * same ssrc are grouped into a single soure object with multiple key value pairs.
 * @param {Object} media - media description to be modified.
 * @returns {void}
 */
const parse = function(sdp) {
    const session = transform.parse(sdp);

    if (typeof session !== 'undefined' && typeof session.media !== 'undefined' && Array.isArray(session.media)) {
        session.media.forEach(mLine => {
            // group sources attributes by ssrc
            if (typeof mLine.ssrcs !== 'undefined' && Array.isArray(mLine.ssrcs)) {
                mLine.sources = [];
                mLine.ssrcs.forEach(ssrc => {
                    const found = mLine.sources.findIndex(source => source.id === ssrc.id);

                    if (found > -1) {
                        mLine.sources[found][ssrc.attribute] = ssrc.value;
                    } else {
                        const src = { id: ssrc.id };

                        src[ssrc.attribute] = ssrc.value;
                        mLine.sources.push(src);
                    }
                });
                delete mLine.ssrcs;
            }

            // split ssrcs in ssrc groups
            if (typeof mLine.ssrcGroups !== 'undefined' && Array.isArray(mLine.ssrcGroups)) {
                mLine.ssrcGroups.forEach(ssrcGroup => {
                    if (typeof ssrcGroup.ssrcs === 'string') {
                        ssrcGroup.ssrcs = ssrcGroup.ssrcs.split(' ');
                    }
                });
            }
        });
    }

    return session;
};

export default {
    write,
    parse
};
