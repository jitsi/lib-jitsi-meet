#!/usr/bin/env bash

if [[ -z "$LIB_JITSI_MEET_REPO" ]];
then
    LIB_JITSI_MEET_REPO="."
fi

COMMIT_HASH=$(cd $LIB_JITSI_MEET_REPO && git rev-parse --short HEAD)
COMMIT_TAG=$(cd $LIB_JITSI_MEET_REPO && git describe --abbrev=0 --tags)

echo "${COMMIT_TAG}#${COMMIT_HASH}";
