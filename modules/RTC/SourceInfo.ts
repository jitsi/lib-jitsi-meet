import { MediaType } from '../../service/RTC/MediaType';
import { VideoType } from '../../service/RTC/VideoType';
import { ITPCGroupInfo } from '../sdp/constansts';

export interface ITPCSourceInfo {
    groups: Array<ITPCGroupInfo>;
    mediaType?: MediaType;
    msid: string;
    ssrcList?: Array<string>;
    ssrcs?: Array<string>;
    videoType?: VideoType;
}
