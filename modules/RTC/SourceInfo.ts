import { MediaType } from '../../service/RTC/MediaType';
import { VideoType } from '../../service/RTC/VideoType';
import { ISsrcGroupInfo } from '../sdp/constants';

export interface ITPCSourceInfo {
    groups: Array<ISsrcGroupInfo>;
    mediaType?: MediaType;
    msid: string;
    ssrcList?: Array<string>;
    ssrcs?: Array<string>;
    videoType?: VideoType;
}
