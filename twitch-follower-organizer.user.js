// ==UserScript==
// @name        Twitch Follower Organizer
// @namespace   twitch-follower-organizer
// @version     0.1.23
// @author      Nesswit
// @description "We need better sidebar" - by wonzy_world, 2021
// @supportURL  https://github.com/rishubil/twitch-follower-organizer/issues
// @homepage    https://github.com/rishubil/twitch-follower-organizer/
// @downloadURL https://raw.githubusercontent.com/rishubil/twitch-follower-organizer/master/twitch-follower-organizer.user.js
// @updateURL   https://raw.githubusercontent.com/rishubil/twitch-follower-organizer/master/twitch-follower-organizer.user.js
// @include     *://*.twitch.tv/*
// @require     https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js
// @run-at      document-start
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       GM_registerMenuCommand
// @grant       GM_addValueChangeListener
// ==/UserScript==

// Define global objects for eslint
/* globals GM_addStyle, GM_setValue, GM_getValue, GM_registerMenuCommand, GM_addValueChangeListener, _ */

(function () {
  'use strict';

  const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const UNKNOWN_GROUP_NAME = 'ETC';
  const GROUPS_VALUE_NAME = 'groups';
  const GROUP_DEFUALT_COLOR = '#a970ff';

  /**
   * User defined channel group, with some states and options
   * @typedef {object} Group
   * @property {string} group_name - The name of group
   * @property {boolean} is_opened - The state of group is opened or not
   * @property {boolean} is_locked - The state of group is locked or not
   * @property {boolean} hide_offline - Whether to show channels that are offline
   * @property {string} color - The Color of group
   * @property {?string[]} channels - List of channels in the group (UNKNOWN group has null value)
   */

  /**
   * Channel infomation from Twitch API
   * @typedef {object} ChannelInfo
   */

  /**
   * @type {Group[]} User defined channel groups
   */
  let groups = null;

  /**
   * @type {Object.<string, ChannelInfo[]>} List of {@link ChannelInfo} grouped by group_name of {@link Group}
   */
  let grouped_channel_infos = {};

  /**
   * @type {object} Response data from Twitch API
   */
  let followedSectionData = null;

  /**
   * Twitch react router's history object
   */
  let reactHistory = null;

  /**
   * @type {boolean} Whether to show overlay
   */
  let shouldShowCardOverlay = false;

  /**
   * @type {Element} Dragged card element
   */
  let dragged_card = null;

  /**
   * Load groups from GM storage
   */
  function loadGroups() {
    const default_groups = [
      {
        group_name: UNKNOWN_GROUP_NAME,
        is_opened: false,
        is_locked: false,
        hide_offline: true,
        color: GROUP_DEFUALT_COLOR,
        channels: null,
      },
    ];
    groups = GM_getValue(GROUPS_VALUE_NAME, default_groups);
    _.forEach(groups, function (value) {
      if (value['is_locked'] === undefined) {
        value['is_locked'] = false;
      }
    });
  }

  /**
   * Save groups to GM storage
   */
  function saveGroups() {
    GM_setValue(GROUPS_VALUE_NAME, groups);
    // console.log({groups});
  }

  /**
   * Find group index from groups by group name
   * @param {string} group_name The name of group
   * @return {number} the index of the found group, else -1
   */
  function findGroupIndexByName(group_name) {
    return _.findIndex(groups, {group_name: group_name});
  }

  /**
   * Add group to groups with name and save
   *
   * @param {string} group_name The name of group
   * @throws If there is the group named `group_name`
   */
  function addGroup(group_name) {
    if (findGroupIndexByName(group_name) !== -1) {
      throw new Error('ALREADY_EXIST');
    }
    groups.splice(0, 0, {
      group_name: group_name,
      is_opened: false,
      is_locked: false,
      hide_offline: true,
      color: GROUP_DEFUALT_COLOR,
      channels: [],
    });
    saveGroups();
  }

  /**
   * Remove group from groups with name and save
   *
   * If there is no group named `group_name`, do nothing.
   *
   * @param {string} group_name The name of group
   * @throws If the group is locked
   */
  function removeGroup(group_name) {
    const group_index = findGroupIndexByName(group_name);
    if (findGroupIndexByName(group_name) === -1) {
      return;
    }
    if (groups[group_index]['is_locked']) {
      throw new Error('LOCKED');
    }
    groups.splice(group_index, 1);
    saveGroups();
  }

  /**
   * Move channel between speific groups using index and channel name
   * @param {number} source_group_index Source group index
   * @param {number} target_group_index Target group index
   * @param {string} channel_name Channel name to move
   * @throws If the group is locked
   */
  function moveChannelBetweenGroups(
    source_group_index,
    target_group_index,
    channel_name
  ) {
    if (source_group_index === target_group_index) {
      return;
    }
    if (
      groups[source_group_index]['is_locked'] ||
      groups[target_group_index]['is_locked']
    ) {
      throw new Error('LOCKED');
    }
    const unknown_group_index = findGroupIndexByName(UNKNOWN_GROUP_NAME);
    if (source_group_index !== unknown_group_index) {
      _.pull(groups[source_group_index]['channels'], channel_name);
    }
    if (target_group_index !== unknown_group_index) {
      _.pull(groups[target_group_index]['channels'], channel_name);
      groups[target_group_index]['channels'].push(channel_name);
    }
    saveGroups();
  }

  /**
   * Move group position by inserting source group into target group index
   * @param {*} source_group_index Source group index
   * @param {*} target_group_index arget group index
   */
  function moveGroupPosition(source_group_index, target_group_index) {
    if (source_group_index === target_group_index) {
      return;
    }
    const source_group = groups[source_group_index];
    groups.splice(source_group_index, 1);
    groups.splice(target_group_index, 0, source_group);
    saveGroups();
  }

  /**
   * Find group from groups by name and return it
   *
   * If there is no group named `group_name`, return null.
   *
   * @param {string} group_name The name of group
   * @return {?Group} founded group, else null
   */
  function getGroupByName(group_name) {
    const group_index = findGroupIndexByName(group_name);
    if (findGroupIndexByName(group_name) === -1) {
      return null;
    }
    return groups[group_index];
  }

  /**
   * Find ChannelInfo from `grouped_channel_infos` by name and return it
   *
   * If there is no group named `group_name`, return null.
   * If there is channel named `channel_name`, return null.
   *
   * @param {string} group_name The name of group
   * @param {string} channel_name The name of channel
   * @return {?ChannelInfo} founded ChannelInfo, else null
   */
  function getChannelInfoByName(group_name, channel_name) {
    const channel_infos = grouped_channel_infos[group_name];
    if (channel_infos == undefined) {
      return null;
    }
    const index = _.findIndex(channel_infos, function (channel_info) {
      return channel_info.user.login === channel_name;
    });
    if (index === -1) {
      return null;
    }
    return channel_infos[index];
  }

  /**
   * Update `is_opened` of group by group name
   *
   * This function will save the new groups and render UI.
   * If there is no group named `group_name`, do nothing.
   *
   * @param {string} group_name The name of group
   * @param {boolean} is_opened `is_opened` value to set
   */
  function setGroupOpened(group_name, is_opened) {
    const group = getGroupByName(group_name);
    if (group === null) {
      return;
    }
    // It will be opened even if the group is locked
    group['is_opened'] = is_opened;
    saveGroups();
    renderFollowedSection();
  }

  /**
   * Find group from groups that contains specific channel
   *
   * If there is no group contains the channel,
   * return UNKNOWN group instead.
   *
   * @param {string} channel The name of channel
   * @return {Group} the found group
   */
  function getGroupByChannel(channel) {
    const group_index = _.findIndex(groups, function (group) {
      if (group.channels === null) {
        return false;
      }
      return group.channels.includes(channel);
    });
    if (group_index === -1) {
      // return UNKNOWN group
      return groups[findGroupIndexByName(UNKNOWN_GROUP_NAME)];
    }
    return groups[group_index];
  }

  /**
   * Get single cookie value by name
   *
   * If there is no cookie named `cookie_name`, return empty string.
   *
   * @param {string} cookie_name The name of cookie
   * @return {string} Cookie value
   */
  function getCookie(cookie_name) {
    let name = cookie_name + '=';
    const decoded_cookie = decodeURIComponent(document.cookie);
    const cookies = decoded_cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      let cookie = cookies[i];
      while (cookie.charAt(0) == ' ') {
        cookie = cookie.substring(1);
      }
      if (cookie.indexOf(name) == 0) {
        return cookie.substring(name.length, cookie.length);
      }
    }
    return '';
  }

  /**
   * Check the user authorized or not
   * @return {boolean} whether user is authorized
   */
  function isAuthed() {
    const token = getCookie('auth-token');
    return token !== '';
  }

  /**
   * Inject CSS styles
   */
  function injectStyle() {
    GM_addStyle(/*css*/ `
      .tbs-tw-transition {
        transition-delay: 0ms;
        transition-duration: 250ms;
        transition-property: none;
        opacity: 1;
        transform: scale(1);
      }
      .tbs-tw-relative {
        position: relative !important;
      }
      .tbs-tw-side-nav-card__link {
        padding: 0.5rem 1rem !important;
        display: flex !important;
        -webkit-box-align: center !important;
        align-items: center !important;
        flex-wrap: nowrap !important;
        width: 100% !important;
      }
      .tbs-tw-side-nav-card__link:hover {
        background: #e6e6ea;
        text-decoration: none;
        color: var(--color-text-link-hover);
      }
      .tw-root--theme-dark .tbs-tw-side-nav-card__link:hover {
        background: #26262c;
      }
      .tbs-tw-link {
        text-decoration: none;
        color: var(--color-text-link);
      }
      .tbs-tw-flex-shrink-0 {
        flex-shrink: 0 !important;
        -webkit-box-align: center !important;
        align-items: center !important;
      }
      .tbs-tw-avatar--size-30 {
        position: relative;
        background-color: inherit;
        width: 3rem;
        height: 3rem;
      }
      .tbs-tw-image-avatar {
        display: block !important;
        border-radius: 9000px !important;
        width: 100% !important;
      }
      .tbs-tw-side-nav-card__metadata_container {
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
        display: flex !important;
        width: 100% !important;
        -webkit-box-pack: justify !important;
        justify-content: space-between !important;
      }
      .tbs-tw-side-nav-card__metadata_wrapper {
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
        margin-left: 1rem !important;
        width: 100% !important;
      }
      .tbs-tw-side-nav-card__title {
        display: flex !important;
        -webkit-box-align: center !important;
        align-items: center !important;
      }
      .tbs-tw-side-nav-title {
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
        -webkit-box-flex: 1 !important;
        flex-grow: 1 !important;
        font-weight: var(--font-weight-semibold) !important;
        color: var(--color-text-alt) !important;
        font-size: var(--font-size-5) !important;
        line-height: var(--line-height-heading) !important;
      }
      .tbs-tw-side-nav-card__metadata {
        padding-right: 0.5rem !important;
      }
      .tbs-tw-side-nav-metadata {
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
        color: var(--color-text-alt-2) !important;
        font-size: var(--font-size-6) !important;
        line-height: var(--line-height-heading) !important;
      }
      .tbs-tw-side-nav-card__live-status {
        min-width: 4rem;
        flex-shrink: 0 !important;
        margin-left: 0.5rem !important;
      }
      .tbs-tw-side-nav-live-status {
        display: flex !important;
        -webkit-box-align: center !important;
        align-items: center !important;
      }
      .tbs-tw-channel-status-indicator {
        background-color: var(--color-fill-live);
        border-radius: var(--border-radius-rounded);
        width: 0.8rem;
        height: 0.8rem;
        display: inline-block;
        position: relative;
      }
      .tbs-tw-channel-status-count-wrapper {
        margin-left: 0.5rem !important;
      }
      .tbs-tw-channel-status-count {
        color: var(--color-text-alt) !important;
        font-size: var(--font-size-6) !important;
      }
      .tbs-tw-button {
        display: inline-flex;
        -webkit-box-align: center;
        align-items: center;
        -webkit-box-pack: center;
        justify-content: center;
        user-select: none;
        height: var(--button-size-default);
        width: var(--button-size-default);
        border-radius: var(--border-radius-medium);
        background-color: var(--color-background-button-text-default);
        color: var(--color-fill-button-icon);
        position: relative;
        vertical-align: middle;
        overflow: hidden;
        text-decoration: none;
        white-space: nowrap;
        font-weight: var(--font-weight-semibold);
        font-size: var(--button-text-default);
      }
      .tbs-tw-button:hover {
        background-color: var(--color-background-button-text-hover);
        color: var(--color-fill-button-icon-hover);
        text-decoration: none;
      }
      .tbs-tw-icon {
        display: inline-flex;
        -webkit-box-align: center;
        align-items: center;
        height: 100%;
        width: 100%;
      }
      .tbs-tw-icon-inner {
        position: relative;
        width: 100%;
        min-height: 100%;
        overflow: hidden;
      }
      .tbs-tw-icon-svg {
        position: absolute;
        left: 0px;
        width: 100%;
        min-height: 100%;
        top: 0px;
      }
      .tbs-tw-aspect {
        position: relative;
        width: 100%;
        overflow: hidden;
      }
      .tbs-tw-avatar {
        position: relative;
        background-color: inherit;
        width: 30px;
        height: 30px;
      }
      .side-nav-section:first-child .tw-transition {
        display: none!important;
      }
      .side-nav-section:first-child .side-nav-show-more-toggle__button {
        display: none!important;
      }
      .side-nav-section:first-child .twitch-better-sidebar .tw-transition {
        display: block!important;
      }
      .side-nav-section:first-child .side-nav-header .tbs-add-group-button {
        position: absolute!important;
        top: 0;
        margin-top: 1rem;
        margin-left: 1rem;
      }
      .tbs-group-header .side-nav-card__live-status {
        display: none;
      }
      .tbs-group-header:hover .side-nav-card__live-status {
        display: block;
      }
      .tbs-group-item {
        background: var(--color-background-base);
        border-left: 0.2rem solid var(--color-background-accent);
      }
      .twitch-better-sidebar-overlay {
        position: fixed;
        z-index: 5000;
        top: 0px;
        left: 0px;
        width: 1px;
        height: 1px;
      }
      .tbs-card-overlay {
        position: absolute;
        z-index: 5100;
      }
      .tbs-group-setting-overlay {
        position: absolute;
        z-index: 5200;
      }
      .tbs-tw-dialog {
        display: inline-block;
        min-width: 16rem;
        max-width: 90vw;
        border-radius: 0.6rem !important;
        background-color: var(--color-background-base) !important;
        box-shadow: var(--shadow-elevation-2) !important;
        color: inherit !important;
      }
      .tbs-tw-interactable {
        display: block;
        width: 100%;
        color: inherit;
      }
      .tbs-tw-interactable:hover {
        background-color: var(--color-background-interactable-hover);
        color: inherit;
        text-decoration: none;
      }
      .tbs-tw-vod-card {
        display: flex !important;
        flex-flow: row nowrap !important;
        -webkit-box-align: center !important;
        align-items: center !important;
      }
      .tbs-tw-vod-card-image {
        flex-shrink: 0;
        background-color: var(--color-background-placeholder);
        overflow: hidden;
        width: 8rem;
        border-radius: 0.2rem !important;
      }
      .tbs-tw-vod-card-image-aspect {
        position: relative;
        width: 100%;
        overflow: hidden;
      }
      .tbs-tw-vod-card-image-aspect-spacer {
        padding-bottom: 56.25%;
      }
      .tbs-tw-vod-card-image-aspect-img {
        position: absolute;
        left: 0px;
        width: 100%;
        min-height: 100%;
        top: 0px;
      }
      .tbs-tw-vod-card-body {
        min-width: 30rem;
        padding-left: 1rem !important;
        padding-right: 1rem !important;
      }
      .tbs-tw-vod-card-body-title {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        color: var(--color-text-base) !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        white-space: normal !important;
      }
      .tbs-tw-vod-card-body-metadata {
        color: var(--color-text-alt-2) !important;
      }
      .tbs-tw-vod-show-all {
        text-align: center !important;
        padding: 0.5rem !important;
      }
      .tbs-tw-vod-show-all-text {
        color: var(--color-text-base) !important;
      }
      .tbs-tw-live-card-body {
        width: 30rem;
        padding: 0.5rem !important;
      }
      .tbs-tw-media-card-image__corners {
        pointer-events: none;
        position: absolute;
        top: 0px;
        left: 0px;
        width: 100%;
        height: 100%;
        display: flex;
        -webkit-box-align: center;
        align-items: center;
        -webkit-box-pack: center;
        justify-content: center;
      }
      .tbs-tw-channel-status-text-indicator-wrapper {
        position: absolute !important;
        top: 0px !important;
        left: 0px !important;
        margin: 1rem !important;
      }
      .tbs-tw-channel-status-text-indicator {
        display: inline-block;
        text-align: center;
        pointer-events: none;
        padding: 0px 0.5rem;
        border-radius: var(--border-radius-medium);
        font-size: var(--font-size-6);
        background-color: var(--color-fill-live);
        color: var(--color-text-overlay);
      }
      .tbs-tw-channel-status-text-indicator-text {
        white-space: nowrap !important;
        text-transform: uppercase !important;
        font-weight: var(--font-weight-semibold) !important;
      }
      .tbs-tw-live-card-title {
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
        font-size: var(--font-size-5) !important;
      }
      .tbs-tw-live-card-text {
        text-overflow: ellipsis;
        white-space: nowrap;
        overflow: hidden;
        font-size: var(--font-size-5) !important;
        color: var(--color-text-alt-2) !important;
      }
      .tbs-group-setting {
        width: 22rem;
      }
      .tbs-group-settings-error {
        display: none;
      }
      .tbs-button-svg {
        stroke: var(--color-fill-button-icon);
      }
      .tbs-group-setting-delete-button .tbs-button-svg {
        stroke: var(--color-text-alert);
      }
      .tbs-tw-input {
        font-family: inherit;
        appearance: none;
        background-clip: padding-box;
        line-height: 1.5;
        transition: box-shadow var(--timing-short) ease-in, border var(--timing-short) ease-in, background-color var(--timing-short) ease-in;
        border-style: solid;
        border-width: var(--border-width-input);
        border-color: var(--color-border-input);
        color: var(--color-text-input);
        background-color: var(--color-background-input);
        display: block;
        width: 100%;
        height: var(--input-size-default);
        border-radius: 0.4rem !important;
        padding: 0.5rem 1rem !important;
        font-size: var(--font-size-6) !important;
      }
      .tbs-tw-input:focus {
        outline: none;
        border-color: var(--color-border-input-focus);
        background-color: var(--color-background-input-focus);
      }
      .tbs-tw-input:hover {
        outline: none;
        border-color: var(--color-border-input-hover);
        background-color: var(--color-background-input);
      }
      .tbs-tw-combo-input {
        display: flex !important;
        width: 100% !important;
      }
      .tbs-tw-combo-input__input {
        -webkit-box-flex: 1;
        flex-grow: 1;
        margin-right: 1px;
      }
      .tbs-tw-combo-input .tbs-tw-input {
        border-radius: 0.4rem 0px 0px 0.4rem !important;
      }
      .tbs-tw-combo-input__button-icon {
        width: 3rem;
        display: inline-flex;
        position: relative;
        -webkit-box-align: center;
        align-items: center;
        -webkit-box-pack: center;
        justify-content: center;
        vertical-align: middle;
        overflow: hidden;
        text-decoration: none;
        white-space: nowrap;
        user-select: none;
        font-weight: var(--font-weight-semibold);
        border-top-right-radius: var(--border-radius-medium);
        border-bottom-right-radius: var(--border-radius-medium);
        font-size: var(--button-text-default);
        height: var(--button-size-default);
        background-color: var(--color-background-button-secondary-default);
        color: var(--color-text-button-secondary);
      }
      .tbs-tw-select {
        font-family: inherit;
        appearance: none;
        background-clip: padding-box;
        transition: box-shadow var(--timing-short) ease-in, border var(--timing-short) ease-in, background-color var(--timing-short) ease-in;
        border-style: solid;
        border-width: var(--border-width-input);
        border-color: var(--color-border-input);
        color: var(--color-text-input);
        background-color: var(--color-background-input);
        background-image: url(data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2020%2020%22%20version%3D%221.1%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%0A%20%20%3Cpath%20fill%3D%22%23efeff1%22%20d%3D%22M10.5%2013.683l2.85-2.442%201.3%201.518-3.337%202.86a1.25%201.25%200%200%201-1.626%200l-3.338-2.86%201.302-1.518%202.849%202.442zm0-7.366L7.65%208.76l-1.3-1.518%203.337-2.86a1.25%201.25%200%200%201%201.627%200l3.337%202.86-1.302%201.518L10.5%206.317z%22%20%2F%3E%0A%3C%2Fsvg%3E);
        background-repeat: no-repeat;
        background-position: right 0.8rem center;
        background-size: 2rem;
        cursor: pointer;
        line-height: normal;
        display: block !important;
        border-radius: 0.4rem !important;
        font-size: var(--font-size-6) !important;
        padding: 0.5rem 3rem 0.5rem 1rem !important;
        width: 100% !important;
      }
      .tbs-tw-select:hover {
        outline: none;
        border-color: var(--color-border-input-hover);
        background-color: var(--color-background-input);
      }
      .tbs-tw-select:focus {
        outline: none;
        border-color: var(--color-border-input-focus);
        background-color: var(--color-background-input-focus);
      }
      .tbs-edit-group-overlay-buttons {
        display: flex !important;
        width: 100%;
        -webkit-box-flex: 1;
        flex-grow: 1;
        flex-shrink: 1;
        -webkit-justify-content: space-between;
        justify-content: space-between;
        margin-top: 1rem;
      }
      .tbs-tw-svg {
        -webkit-box-align: center;
        align-items: center;
        display: inline-flex;
      }
      .tbs-tw-svg-icon {
        fill: var(--color-fill-alt-2);
      }
      .tbs-stream-type-indicator {
        color: var(--color-text-overlay) !important;
        background-color: var(--color-background-overlay) !important;
        padding-left: 0.5rem !important;
        padding-right: 0.5rem !important;
        border-radius: 0.2rem !important;
        display: flex !important;
      }
      .tbs-stream-type-indicator-inner {
        display: flex !important;
        -webkit-box-align: center !important;
        align-items: center !important;
        margin-right: 0.5rem !important;
      }
      .tbs-stream-type-indicator-icon {
        fill: var(--color-fill-current);
      }
    `);
  }

  /**
   * Request Twitch GraphQL API to get {@link ChannelInfo}
   *
   * It will call {@link processFollowedSectionData} to process retrived data.
   */
  function requestFollowedSectionData() {
    if (!isAuthed()) {
      return;
    }
    const token = getCookie('auth-token');
    const unique_id = getCookie('unique_id');

    console.log('[TBS] requesting FollowedSectionData...');
    fetch('https://gql.twitch.tv/gql', {
      method: 'POST',
      headers: {
        connection: 'keep-alive',
        authorization: 'OAuth ' + token,
        dnt: '1',
        'accept-language': 'ko-KR',
        'client-id': CLIENT_ID,
        'x-device-id': unique_id,
        'content-type': 'text/plain;charset=UTF-8',
        accept: '*/*',
        origin: 'https://www.twitch.tv',
        'sec-fetch-site': 'same-site',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        referer: 'https://www.twitch.tv/',
      },
      body: `[{"operationName":"PersonalSections","variables":{"input":{"sectionInputs":["FOLLOWED_SECTION","RECOMMENDED_SECTION"],"recommendationContext":{"platform":"web"}},"channelLogin":null,"withChannelUser":false},"extensions":{"persistedQuery":{"version":1,"sha256Hash":"469efc9442aa2b7634a3ab36eae1778b78ec7ccf062d2b17833afb0e66b78a25"}}}]`,
    })
      .then((response) => response.json())
      .then((data) => {
        followedSectionData = data;
        processFollowedSectionData();
      });
  }

  /**
   * @type {function} `requestFollowedSectionData`, but debounced
   */
  const debouncedRequestFollowedSectionData = _.debounce(
    requestFollowedSectionData,
    200
  );
  GM_registerMenuCommand(
    'Update followed channels data',
    requestFollowedSectionData,
    'U'
  );
  GM_addValueChangeListener(
    GROUPS_VALUE_NAME,
    function (name, old_value, new_value, remote) {
      if (remote) {
        groups = new_value;
        debouncedRequestFollowedSectionData();
      }
    }
  );

  /**
   * Convert raw data into `grouped_channel_infos`
   *
   * It will call {@link renderFollowedSection}.
   */
  function processFollowedSectionData() {
    // clear old grouped_channel_infos and set default values
    grouped_channel_infos = {};
    for (let group_index = 0; group_index < groups.length; group_index++) {
      const group = groups[group_index];
      grouped_channel_infos[group['group_name']] = [];
    }

    // append ChannelInfo to each group
    const channel_infos = followedSectionData[0].data.personalSections[0].items;
    for (let index = 0; index < channel_infos.length; index++) {
      const channel_info = channel_infos[index];
      if (channel_info.user === null) {
        continue;
      }
      const channel = channel_info.user.login;
      const group = getGroupByChannel(channel);
      grouped_channel_infos[group['group_name']].push(channel_info);
    }

    renderFollowedSection();
  }
  GM_registerMenuCommand('Refresh Group UI', processFollowedSectionData, 'R');

  /**
   * Render UI from data
   */
  function renderFollowedSection() {
    const transitionGroupEl = document.querySelector(
      '.side-nav-section:first-child .tw-transition-group'
    );
    if (transitionGroupEl === null) {
      console.log('[TBS] transitionGroup is not loaded');
      return;
    }

    let tbsEl = transitionGroupEl.getElementsByClassName(
      'twitch-better-sidebar'
    );
    if (tbsEl.length === 0) {
      tbsEl = document.createElement('div');
      tbsEl.classList.add('twitch-better-sidebar');
      transitionGroupEl.appendChild(tbsEl);
    } else {
      tbsEl = tbsEl[0];
    }

    let tbsHtml = '';
    for (let group_index = 0; group_index < groups.length; group_index++) {
      const group = groups[group_index];
      const channel_infos = grouped_channel_infos[group['group_name']];
      tbsHtml += generateTbsGroupHtml(group_index, channel_infos);
    }
    tbsEl.innerHTML = tbsHtml;

    const sideNavHeaderTextEl = document.querySelector(
      '.side-nav-section:first-child .side-nav-header h2'
    );
    if (sideNavHeaderTextEl !== null) {
      let addGroupButtonEl = sideNavHeaderTextEl.getElementsByClassName(
        'tbs-add-group-button'
      );
      if (addGroupButtonEl.length === 0) {
        addGroupButtonEl = document.createElement('button');
        sideNavHeaderTextEl.appendChild(addGroupButtonEl);

        const templateAddGroupButton = _.template(/*html*/ `
          <button aria-label="그룹 추가"
            class="tbs-add-group-button tbs-tw-button"><span
                class="tw-button-icon__icon">
                <div style="width: 2rem; height: 2rem;">
                    <div class="tbs-tw-icon">
                        <div class="tbs-tw-icon-inner">
                          <svg xmlns="http://www.w3.org/2000/svg" class="tbs-button-svg tbs-tw-icon-svg" width="100%" height="100%" viewBox="0 0 24 24" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                            <path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2" />
                            <line x1="12" y1="10" x2="12" y2="16" />
                            <line x1="9" y1="13" x2="15" y2="13" />
                          </svg>
                        </div>
                    </div>
                </div>
            </span></button>
        `);
        addGroupButtonEl.outerHTML = templateAddGroupButton();
      }
    }
  }

  /**
   * Generate HTML string of group to render for group
   * @param {number} group_index The index of groups
   * @param {ChannelInfo[]} channel_infos List of ChannelInfo in the group
   * @return {string} Generated HTML string
   */
  function generateTbsGroupHtml(group_index, channel_infos) {
    const group = groups[group_index];
    const display_names_string = _.join(
      _.map(channel_infos, function (channel_info) {
        return channel_info.user.displayName;
      }),
      ', '
    );
    const is_someone_live = _.some(channel_infos, function (channel_info) {
      return channel_info.content.type !== undefined;
    });
    const total_live_string = _.sumBy(channel_infos, function (channel_info) {
      if (channel_info.content.type !== undefined) {
        return 1;
      }
      return 0;
    }).toLocaleString();
    let group_item_html = '';
    if (group['is_opened']) {
      for (
        let channel_info_index = 0;
        channel_info_index < channel_infos.length;
        channel_info_index++
      ) {
        const channel_info = channel_infos[channel_info_index];
        // render live channels, and if hide_offline is false, render offline channels too.
        if (channel_info.content.type !== undefined || !group['hide_offline']) {
          group_item_html += generateTbsGroupItemHtml(
            group_index,
            channel_info
          );
        }
      }
    }

    const templateTbsGroup = _.template(/*html*/ `
      <div class="tbs-group">
        <div class="tbs-tw-transition"
          style="transition-property: transform, opacity; transition-timing-function: ease;">
          <div>
            <div class="side-nav-card tbs-tw-relative" data-test-selector="side-nav-card"><a
                class="tbs-group-header tbs-tw-side-nav-card__link tbs-tw-link"
                data-tbs-group-index="<%- group_index %>" href="#" draggable="true">
                <div class="side-nav-card__avatar tbs-tw-flex-shrink-0">
                  <figure aria-label="<%- group['group_name'] %>" class="tbs-tw-avatar--size-30">
                    <% if (group['is_opened']) { %>
                      <svg xmlns="http://www.w3.org/2000/svg" class="tbs-tw-image-avatar" alt="<%- group['group_name'] %>" width="30" height="30" viewBox="0 0 24 24" stroke-width="2" stroke="<%- group['color'] %>" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <path d="M9 4h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
                        <path d="M17 17v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h2" />
                        <% if (is_someone_live) { %>
                          <line x1="17" y1="10" x2="17" y2="12.5" />
                          <line x1="13.5" y1="10" x2="13.5" y2="12.5" />
                        <% } %>
                      </svg>
                    <% } else { %>
                      <svg xmlns="http://www.w3.org/2000/svg" class="tbs-tw-image-avatar" alt="<%- group['group_name'] %>" width="30" height="30" viewBox="0 0 24 24" stroke-width="2" stroke="<%- group['color'] %>" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2" />
                        <% if (is_someone_live) { %>
                          <line x1="16" y1="11" x2="16" y2="14" />
                          <line x1="12" y1="11" x2="12" y2="14" />
                        <% } %>
                      </svg>
                    <% } %>
                  </figure>
                </div>
                <div class="tbs-tw-side-nav-card__metadata_container">
                  <div data-a-target="side-nav-card-metadata" class="tbs-tw-side-nav-card__metadata_wrapper">
                    <div class="tbs-side-nav-card__title">
                      <p data-a-target="side-nav-title"
                        class="tbs-tw-side-nav-title"
                        title="<%- group['group_name'] %> (<%- total_live_string %>/<%- channel_infos.length %>)"><span><%- group['group_name'] %> (<%- total_live_string %>/<%- channel_infos.length %>)</span></p>
                    </div>
                    <div class="tbs-tw-side-nav-card__metadata" data-a-target="side-nav-game-title">
                      <p class="tbs-tw-side-nav-metadata"
                        title="<%- display_names_string %>"><%- display_names_string %></p>
                    </div>
                  </div><div class="tbs-tw-side-nav-card__live-status"
                      data-a-target="side-nav-live-status">
                      <button aria-label="그룹 수정"
                        class="tbs-edit-button tbs-tw-button"
                        data-tbs-group-index="<%- group_index %>">
                            <div style="width: 2rem; height: 2rem;">
                                <div class="tbs-tw-icon">
                                    <div class="tbs-tw-icon-inner">
                                      <svg xmlns="http://www.w3.org/2000/svg" class="tbs-button-svg tbs-tw-icon-svg" width="100%" height="100%" viewBox="0 0 24 24" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                        <path d="M4 20h4l10.5 -10.5a1.5 1.5 0 0 0 -4 -4l-10.5 10.5v4" />
                                        <line x1="13.5" y1="6.5" x2="17.5" y2="10.5" />
                                      </svg>
                                    </div>
                                </div>
                            </div>
                        </span></button>
                    </div>
                  </div>
              </a></div>
          </div>
        </div>
        <%= group_item_html %>
      </div>
    `);
    return templateTbsGroup({
      group_index: group_index,
      group: group,
      group_item_html: group_item_html,
      total_live_string: total_live_string,
      is_someone_live: is_someone_live,
      channel_infos: channel_infos,
      display_names_string: display_names_string,
    });
  }

  /**
   * Generate HTML string of channel to render for group item
   * @param {number} group_index The index of groups
   * @param {ChannelInfo} channel_info ChannelInfo to render
   * @return {string} Generated HTML string
   */
  function generateTbsGroupItemHtml(group_index, channel_info) {
    const templateTbsGroupItem = _.template(/*html*/ `
      <div class="tbs-tw-transition"
        style="transition-property: transform, opacity; transition-timing-function: ease;">
        <div>
          <div class="side-nav-card tbs-tw-relative" data-test-selector="side-nav-card"><a
              class="tbs-group-item tbs-link tbs-tw-side-nav-card__link tbs-tw-link"
              data-test-selector="followed-channel" data-tbs-group-index="<%- group_index %>" data-tbs-channel="<%-  channel_info.user.login %>" href="/<%- channel_info.user.login %>" draggable="<%- draggable %>">
              <div class="side-nav-card__avatar <% if (!is_online) { %>side-nav-card__avatar--offline <% } %> tbs-tw-flex-shrink-0">
                <figure aria-label="<%- channel_info.user.displayName %> (<%- channel_info.user.login %>)" class="tbs-tw-avatar--size-30"><img
                    class="tbs-tw-image-avatar"
                    alt="<%- channel_info.user.displayName %> (<%- channel_info.user.login %>)"
                    src="<%- channel_info.user.profileImageURL %>">
                </figure>
              </div>
              <div class="tbs-tw-side-nav-card__metadata_container">
                <div data-a-target="side-nav-card-metadata" class="tbs-tw-side-nav-card__metadata_wrapper">
                  <div class="tbs-side-nav-card__title">
                    <p data-a-target="side-nav-title"
                      class="tbs-tw-side-nav-title"
                      title="<%- channel_info.user.displayName %> (<%- channel_info.user.login %>)"><span><%- channel_info.user.displayName %> <span
                          class="intl-login">(<%- channel_info.user.login %>)</span></span></p>
                  </div>
                  <div class="tbs-tw-side-nav-card__metadata" data-a-target="side-nav-game-title">
                    <% if (is_online && channel_info.content.game !== null) { %>
                      <p class="tbs-tw-side-nav-metadata"
                        title="<%- channel_info.content.game.displayName %>"><%- channel_info.content.game.displayName %></p>
                    <% } else if (!is_online && channel_info.content.edges.length > 0) { %>
                      <p class="tbs-tw-side-nav-metadata"
                        title="새 동영상 <%- channel_info.content.edges.length.toLocaleString() %>개">새 동영상 <%- channel_info.content.edges.length.toLocaleString() %>개</p>
                    <% } else { %>
                      <p class="tbs-tw-side-nav-metadata"></p>
                    <% } %>
                  </div>
                </div>
                <div class="tbs-tw-side-nav-card__live-status"
                  data-a-target="side-nav-live-status">
                  <% if (is_online) { %>
                    <div class="tbs-tw-side-nav-live-status">
                      <% if (is_live) { %>
                        <div class="tbs-tw-channel-status-indicator"
                          data-test-selector="0"></div>
                      <% } else { %>
                        <figure class="tbs-tw-svg" data-test-selector="0">
                          <svg type="color-fill-alt-2" width="12px" height="12px" version="1.1" viewBox="0 0 20 20" x="0px" y="0px" class="tbs-tw-svg-icon">
                            <g>
                              <path d="M10 16a5.98 5.98 0 004.243-1.757l1.414 1.414A8 8 0 1116 4.708V2h2v6h-6V6h2.472A6 6 0 1010 16z"></path>
                            </g>
                          </svg>
                        </figure>
                      <% } %>
                      <div class="tbs-tw-channel-status-count-wrapper"><span data-test-selector="1" aria-label="시청자 <%- channel_info.content.viewersCount.toLocaleString() %>명"
                          class="tbs-tw-channel-status-count"><%- channel_info.content.viewersCount.toLocaleString() %></span></div>
                    </div>
                  <% } else { %>
                    <span class="tbs-tw-channel-status-count">오프라인</span>
                  <% } %>
                </div>
              </div>
            </a></div>
        </div>
      </div>
    `);
    return templateTbsGroupItem({
      group_index: group_index,
      draggable: groups[group_index]['is_locked'] ? 'false' : 'true',
      channel_info: channel_info,
      is_online: channel_info.content.type !== undefined,
      is_live: channel_info.content.type === 'live',
    });
  }

  /**
   * Get overlay element
   * @return {Element} Overlay element
   */
  function getOverlay() {
    let tbsoEl = document.getElementsByClassName(
      'twitch-better-sidebar-overlay'
    );
    if (tbsoEl.length === 0) {
      tbsoEl = document.createElement('div');
      tbsoEl.classList.add('twitch-better-sidebar-overlay');
      document.querySelector('body').appendChild(tbsoEl);
    } else {
      tbsoEl = tbsoEl[0];
    }
    return tbsoEl;
  }

  /**
   * Clear card overlay
   * @param {boolean} [needCheck=true] Whether check `shouldShowCardOverlay`
   */
  function clearCardOverlay(needCheck = true) {
    if (needCheck && shouldShowCardOverlay) {
      return;
    }
    const tbsoEl = getOverlay();
    const cardOverlay = tbsoEl.getElementsByClassName('tbs-card-overlay');
    if (cardOverlay.length !== 0) {
      _.forEach(cardOverlay, function (o) {
        o.remove();
      });
    }
  }

  /**
   * @type {function} Clear card overlay, but debounced
   */
  const debouncedClearCardOverlay = _.debounce(clearCardOverlay, 200);

  /**
   * Show Channel's overlay
   * @param {Element} card channel's card element
   * @param {ChannelInfo} channel_info ChannelInfo to draw overlay
   */
  function showChannelOverlay(card, channel_info) {
    const tbsoEl = getOverlay();
    clearCardOverlay(false);

    const rect = card.getBoundingClientRect();
    const x = rect.x + rect.width;
    const y = rect.y;

    const innerOverlay = document.createElement('div');
    innerOverlay.classList.add('tbs-card-overlay');
    innerOverlay.style.left = `${x}px`;
    innerOverlay.style.top = `${y}px`;

    innerOverlay.innerHTML = generateTbsCardOverlayHtml(channel_info);

    tbsoEl.appendChild(innerOverlay);

    shouldShowCardOverlay = true;
  }

  /**
   * Generate HTML string of channel to render for card overlay
   * @param {ChannelInfo} channel_info ChannelInfo to render
   * @return {string} Generated HTML string
   */
  function generateTbsCardOverlayHtml(channel_info) {
    const templateTbsCardOverlay = _.template(/*html*/ `
      <div class="tbs-tw-transition"
        style="transition-property: transform, opacity; transition-timing-function: ease;">
        <div style="padding-left: 1rem !important;">
          <div class="tbs-tw-dialog" role="dialog">
            <div style="padding: 0.5rem !important;">
            <% if (is_online) { %>
              <div class="tbs-tw-live-card-body">
                <div class="tw-c-text-overlay" style="margin-bottom: 0.5rem;">
                  <div class="tbs-tw-relative">
                    <div class="tbs-tw-vod-card-image-aspect">
                      <div class="tbs-tw-vod-card-image-aspect-spacer"></div>
                      <img altsrc="https://static-cdn.jtvnw.net/ttv-static/404_preview-160x90.jpg" alt="<%- channel_info.user.displayName %><% if (is_online && channel_info.content.game !== null) { %> · <%- channel_info.content.game.displayName %><% } %>" class="tbs-tw-vod-card-image-aspect-img" src="https://static-cdn.jtvnw.net/previews-ttv/live_user_<%- channel_info.user.login %>-320x180.jpg?tf=<%- time_factor %>">
                    </div>
                    <div class="tbs-tw-media-card-image__corners">
                      <div class="tbs-tw-channel-status-text-indicator-wrapper">
                        <% if (is_live) { %>
                          <div class="tbs-tw-channel-status-text-indicator" font-size="font-size-6">
                            <p class="tbs-tw-channel-status-text-indicator-text">생방송</p>
                          </div>
                        <% } else { %>
                          <div class="tbs-stream-type-indicator tbs-stream-type-indicator--rerun">
                            <div class="tbs-stream-type-indicator-inner">
                              <figure class="tbs-tw-svg">
                                <svg type="color-fill-current" width="14px" height="14px" version="1.1" viewBox="0 0 20 20" x="0px" y="0px" class="tbs-stream-type-indicator-icon">
                                  <g>
                                    <path d="M10 16a5.98 5.98 0 004.243-1.757l1.414 1.414A8 8 0 1116 4.708V2h2v6h-6V6h2.472A6 6 0 1010 16z"></path>
                                  </g>
                                </svg>
                              </figure>
                            </div>
                          <span class="">재방송</span></div>
                        <% } %>
                      </div>
                    </div>
                  </div>
                </div>
                <p class="tbs-tw-live-card-title"><%- channel_info.user.displayName %><% if (is_online && channel_info.content.game !== null) { %> · <%- channel_info.content.game.displayName %><% } %></p>
                <p class="tbs-tw-live-card-title"><%- channel_info.user.broadcastSettings.title %></p>
                <p class="tbs-tw-live-card-text">시청자 <%- channel_info.content.viewersCount.toLocaleString() %>명</p>
              </div>
            <% } else { %>
              <div>
                <% for (let i = 0; i < channel_info.content.edges.length; i++) {
                  const node = channel_info.content.edges[i].node; %>
                  <a class="tbs-link tbs-tw-interactable"
                    href="/videos/<%- node.id %>">
                    <div style="padding: 0.5rem !important;">
                      <div class="tw-card tbs-tw-relative">
                        <div class="tbs-tw-vod-card">
                          <div class="tbs-tw-vod-card-image">
                            <div class="tbs-tw-vod-card-image-aspect">
                              <div class="tbs-tw-vod-card-image-aspect-spacer"></div><img alt="<%- node.title %>"
                                class="tbs-tw-vod-card-image-aspect-img" src="<%- node.previewThumbnailURL %>">
                            </div>
                          </div>
                          <div class="tbs-tw-relative">
                            <div class="tbs-tw-vod-card-body">
                              <p class="tbs-tw-vod-card-body-title" title="<%- node.title %>"><%- node.title %></p>
                              <p data-test-selector="offline-followed-channel-tooltip-text"
                                class="tbs-tw-vod-card-body-metadata"><%- node.viewCount.toLocaleString() %>회 시청</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </a>
                <% } %>
                <a class="tbs-link tbs-tw-interactable""
                  href="/<%- channel_info.user.login %>/videos/all">
                  <div class="tbs-tw-vod-show-all">
                    <p class="tbs-tw-vod-show-all-text">최근 동영상 모두 보기</p>
                  </div>
                </a>
              </div>
            <% } %>
          </div>
        </div>
      </div>
    `);
    return templateTbsCardOverlay({
      channel_info: channel_info,
      is_online: channel_info.content.type !== undefined,
      is_live: channel_info.content.type === 'live',
      time_factor: Math.round(new Date().getTime() / (1000 * 60 * 5)), // it will be changed every 5 minutes
    });
  }

  /**
   * Clear group setting overlay
   */
  function clearGroupSettingOverlay() {
    const tbsoEl = getOverlay();
    const groupSettingOverlay = tbsoEl.getElementsByClassName(
      'tbs-group-setting-overlay'
    );
    if (groupSettingOverlay.length !== 0) {
      _.forEach(groupSettingOverlay, function (o) {
        o.remove();
      });
    }
  }

  /**
   * get group from setting overlay
   *
   * @return {?Group} Return group if there is the group else null.
   */
  function getGroupFromSettingOverlray() {
    let groupSettingEl = document.getElementsByClassName('tbs-group-setting');
    if (groupSettingEl.length === 0) {
      return null;
    } else {
      groupSettingEl = groupSettingEl[0];
    }
    const target_group_name = groupSettingEl.dataset.tbsGroupName;
    const group = getGroupByName(target_group_name);
    return group;
  }

  /**
   * Reset group color input on setting overlay
   *
   * If there is no group setting overlay, do nothing.
   * If the group is locked, do nothing.
   */
  function resetGroupColorOnSettingOverlay() {
    let groupSettingEl = document.getElementsByClassName('tbs-group-setting');
    if (groupSettingEl.length === 0) {
      return;
    } else {
      groupSettingEl = groupSettingEl[0];
    }
    const target_group_name = groupSettingEl.dataset.tbsGroupName;
    const group = getGroupByName(target_group_name);
    if (group['is_locked']) {
      return;
    }
    const colorEl = groupSettingEl.getElementsByClassName(
      'tbs-group-setting-color'
    )[0];
    colorEl.value = GROUP_DEFUALT_COLOR;
  }

  /**
   * Set group locked from setting overlay
   *
   * If there is no group setting overlay, do nothing.
   *
   * @return {?string} Return null if save successfully, else error text.
   */
  function setGroupLockedFromSettingOverlay(is_locked) {
    const group = getGroupFromSettingOverlray();
    if (group['group_name'] === UNKNOWN_GROUP_NAME) {
      return '잠금 여부를 변경할 수 없는 그룹입니다.';
    }

    group['is_locked'] = is_locked;

    saveGroups();

    return null;
  }

  /**
   * Save group from setting overlay
   *
   * If there is no group setting overlay, do nothing.
   *
   * @return {?string} Return null if save successfully, else error text.
   */
  function saveGroupFromSettingOverlay() {
    let groupSettingEl = document.getElementsByClassName('tbs-group-setting');
    if (groupSettingEl.length === 0) {
      return;
    } else {
      groupSettingEl = groupSettingEl[0];
    }
    const target_group_name = groupSettingEl.dataset.tbsGroupName;
    const group = getGroupByName(target_group_name);
    if (group['is_locked']) {
      return '그룹이 잠겨있습니다.';
    }

    const group_name = groupSettingEl.getElementsByClassName(
      'tbs-group-setting-group-name'
    )[0].value;
    const color = groupSettingEl.getElementsByClassName(
      'tbs-group-setting-color'
    )[0].value;
    const hide_offline =
      groupSettingEl.getElementsByClassName('tbs-group-setting-hide-offline')[0]
        .value === 'true';

    if (
      group['group_name'] === UNKNOWN_GROUP_NAME &&
      group['group_name'] !== group_name
    ) {
      // UNKNOWN group cannot be changed name
      return '이름을 변경할 수 없는 그룹입니다.';
    }

    if (
      group['group_name'] !== group_name &&
      (findGroupIndexByName(group_name) !== -1 ||
        group_name === UNKNOWN_GROUP_NAME)
    ) {
      // group_name is already taken
      return '이미 존재하는 그룹 제목입니다.';
    }

    group['group_name'] = group_name;
    group['color'] = color;
    group['hide_offline'] = hide_offline;

    saveGroups();

    return null;
  }

  /**
   * Delete group from setting overlay
   *
   * If there is no group setting overlay, do nothing.
   *
   * @return {?string} Return null if delete successfully, else error text.
   */
  function deleteGroupFromSettingOverlay() {
    const group = getGroupFromSettingOverlray();
    const target_group_name = group['group_name'];

    if (group['is_locked']) {
      return '그룹이 잠겨있습니다.';
    }

    if (target_group_name === UNKNOWN_GROUP_NAME) {
      // UNKNOWN group cannot be deleted
      return '삭제할 수 없는 그룹입니다.';
    }

    removeGroup(target_group_name);
    return null;
  }

  /**
   * Show group setting overlay
   * @param {Group} group group to change setting
   */
  function showGroupSettingOverlay(group) {
    const tbsoEl = getOverlay();
    clearGroupSettingOverlay();

    const sideBarEl = document.getElementsByClassName('side-nav')[0];
    const rect = sideBarEl.getBoundingClientRect();
    const x = rect.x + rect.width;
    const y = rect.y + 48;

    const innerOverlay = document.createElement('div');
    innerOverlay.classList.add('tbs-group-setting-overlay');
    innerOverlay.style.left = `${x}px`;
    innerOverlay.style.top = `${y}px`;

    innerOverlay.innerHTML = generateTbsGroupSettingOverlayHtml(group);

    tbsoEl.appendChild(innerOverlay);
  }

  /**
   * Generate HTML string of channel to render for group setting overlay
   * @param {Group} group group to render
   * @return {string} Generated HTML string
   */
  function generateTbsGroupSettingOverlayHtml(group) {
    const templateTbsGroupSettingOverlay = _.template(/*html*/ `
      <div class="tbs-tw-transition"
        style="transition-property: transform, opacity; transition-timing-function: ease;">
        <div style="padding-left: 1rem !important;">
          <div class="tbs-tw-dialog" role="dialog">
            <div class="tbs-group-setting" style="padding: 0.5rem !important;" data-tbs-group-name="<%- group['group_name'] %>">
              <div style="padding: 1rem !important;" >
                <div>
                  <div style="margin-bottom: 0.5rem;">
                    <label class="tw-form-label">그룹 제목</label>
                  </div>
                  <input type="text"
                    class="tbs-group-setting-group-name tbs-tw-input"
                    autocapitalize="off" autocorrect="off" autocomplete="off"
                    spellcheck="false" value="<%- group['group_name'] %>"<% if (is_unknown_group || group['is_locked']) { %> disabled="disabled"<% } %>>
                </div>
                <div>
                  <div style="margin-bottom: 0.5rem; margin-top: 1rem;">
                    <label class="tw-form-label">색상</label>
                  </div>
                  <div class="tbs-tw-combo-input">
                    <div class="tbs-tw-combo-input__input">
                      <div class="tbs-tw-relative">
                        <input type="text" class="tbs-group-setting-color tbs-tw-input" autocapitalize="off" autocorrect="off" autocomplete="off"
                        spellcheck="false" value="<%- group['color'] %>"<% if (group['is_locked']) { %> disabled="disabled"<% } %>>
                      </div>
                    </div>
                    <button aria-label="색상 초기화" class="tbs-group-setting-color-reset-button tbs-tw-combo-input__button-icon<% if (group['is_locked']) { %> tw-core-button--disabled<% } %>">
                      <div style="width: 2rem; height: 2rem;">
                        <div class="tbs-tw-icon">
                          <div class="tbs-tw-icon-inner">
                            <svg xmlns="http://www.w3.org/2000/svg" class="tbs-button-svg tbs-tw-icon-svg" width="100%" height="100%" viewBox="0 0 24 24" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                              <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
                              <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
                <div>
                  <div style="margin-bottom: 0.5rem; margin-top: 1rem;">
                    <label class="tw-form-label">오프라인 채널 표시 여부</label>
                  </div>
                  <select
                    class="tbs-group-setting-hide-offline tbs-tw-select"<% if (group['is_locked']) { %> disabled="disabled"<% } %>>
                    <option value="false"<% if (!group['hide_offline']) { %>selected="selected"<% } %>>표시함</option>
                    <option value="true"<% if (group['hide_offline']) { %>selected="selected"<% } %>>표시하지 않음</option>
                  </select>
                </div>
                <div class="tbs-edit-group-overlay-buttons">
                  <% if (!is_unknown_group) { %>
                    <div>
                      <button aria-label="삭제"
                      class="tbs-group-setting-delete-button tbs-tw-button<% if (group['is_locked']) { %> tw-core-button--disabled<% } %>"><span
                        class="tw-button-icon__icon">
                        <div style="width: 2rem; height: 2rem;">
                          <div class="tbs-tw-icon">
                            <div class="tbs-tw-icon-inner">
                              <svg xmlns="http://www.w3.org/2000/svg" class="tbs-button-svg tbs-tw-icon-svg" width="100%" height="100%" viewBox="0 0 24 24"stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <line x1="4" y1="7" x2="20" y2="7" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                                <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                                <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </span></button>
                      <% if (group['is_locked']) { %>
                        <button aria-label="잠금 해제"
                        class="tbs-group-setting-unlock-button tbs-tw-button"><span
                          class="tw-button-icon__icon">
                          <div style="width: 2rem; height: 2rem;">
                            <div class="tbs-tw-icon">
                              <div class="tbs-tw-icon-inner">
                                <svg xmlns="http://www.w3.org/2000/svg" class="tbs-button-svg tbs-tw-icon-svg" width="100%" height="100%" viewBox="0 0 24 24"stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                  <rect x="5" y="11" width="14" height="10" rx="2" />
                                  <circle cx="12" cy="16" r="1" />
                                  <path d="M8 11v-5a4 4 0 0 1 8 0" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </span></button>
                      <% } else { %>
                        <button aria-label="잠금"
                        class="tbs-group-setting-lock-button tbs-tw-button"><span
                          class="tw-button-icon__icon">
                          <div style="width: 2rem; height: 2rem;">
                            <div class="tbs-tw-icon">
                              <div class="tbs-tw-icon-inner">
                                <svg xmlns="http://www.w3.org/2000/svg" class="tbs-button-svg tbs-tw-icon-svg" width="100%" height="100%" viewBox="0 0 24 24"stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                  <rect x="5" y="11" width="14" height="10" rx="2" />
                                  <circle cx="12" cy="16" r="1" />
                                  <path d="M8 11v-4a4 4 0 0 1 8 0v4" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </span></button>
                      <% } %>
                    </div>
                  <% } else { %>
                    <div></div>
                  <% } %>
                  <div>
                    <button aria-label="취소"
                      class="tbs-group-setting-cancel-button tbs-tw-button"><span
                        class="tw-button-icon__icon">
                        <div style="width: 2rem; height: 2rem;">
                          <div class="tbs-tw-icon">
                            <div class="tbs-tw-icon-inner">
                              <svg xmlns="http://www.w3.org/2000/svg" class="tbs-button-svg tbs-tw-icon-svg" width="100%" height="100%" viewBox="0 0 24 24" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </span></button>
                    <button aria-label="저장"
                      class="tbs-group-setting-save-button tbs-tw-button<% if (group['is_locked']) { %> tw-core-button--disabled<% } %>"><span
                        class="tw-button-icon__icon">
                        <div style="width: 2rem; height: 2rem;">
                          <div class="tbs-tw-icon">
                            <div class="tbs-tw-icon-inner">
                              <svg xmlns="http://www.w3.org/2000/svg" class="tbs-button-svg tbs-tw-icon-svg" width="100%" height="100%" viewBox="0 0 24 24" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <path d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2" />
                                <circle cx="12" cy="14" r="2" />
                                <polyline points="14 4 14 8 8 8 8 4" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </span></button>
                  </div>
                </div>
              <div class="tbs-group-settings-error tw-mg-t-1"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `);
    return templateTbsGroupSettingOverlay({
      group: group,
      is_unknown_group: group['group_name'] === UNKNOWN_GROUP_NAME,
    });
  }

  /**
   * Find target from event by class name
   * @param {Event} event target event
   * @param {string} class_name class name to find
   * @param {number} max_bubble_count maximum recursive depth, default is 10
   */
  function findEventTargetByClassName(
    event,
    class_name,
    max_bubble_count = 20
  ) {
    let current_target = event.target;
    let bubble_count = 0;
    while (bubble_count < max_bubble_count && current_target !== null) {
      if (current_target.classList.contains(class_name)) {
        return current_target;
      }
      current_target = current_target.parentElement;
      bubble_count++;
    }
    return null;
  }

  function scrollOnDrag(element, scrollDiff) {
    if (scrollDiff < 0) {
      element.scrollTop = Math.max(0, element.scrollTop + scrollDiff);
    } else {
      element.scrollTop = Math.min(
        element.scrollHeight - element.clientHeight,
        element.scrollTop + scrollDiff
      );
    }
  }

  /**
   * @type {function} `scrollOnDrag`, but debounced
   */
  const debouncedScrollOnDrag = _.debounce(scrollOnDrag, 5);

  /**
   * Register global event listeners
   */
  function registerEventListeners() {
    document.addEventListener(
      'click',
      function (e) {
        if (e.target) {
          const addGroupButton = findEventTargetByClassName(
            e,
            'tbs-add-group-button'
          );
          if (addGroupButton !== null) {
            let groupNumber = 1;
            // eslint-disable-next-line no-constant-condition
            while (true) {
              try {
                const group_name = `그룹 ${groupNumber}`;
                addGroup(`그룹 ${groupNumber}`);
                processFollowedSectionData();
                const group = getGroupByName(group_name);
                showGroupSettingOverlay(group);
                e.preventDefault();
                return;
              } catch (err) {
                if (err.message !== 'ALREADY_EXIST') {
                  console.log(err);
                  break;
                }
                groupNumber++;
              }
            }
          }
          const editButton = findEventTargetByClassName(e, 'tbs-edit-button');
          if (editButton !== null) {
            const group_index = Number(editButton.dataset.tbsGroupIndex);
            const group = groups[group_index];

            // check opened group settings is same with this group
            const groupSettingEl =
              document.getElementsByClassName('tbs-group-setting');
            if (
              groupSettingEl.length !== 0 &&
              groupSettingEl[0].dataset.tbsGroupName === group.group_name
            ) {
              clearGroupSettingOverlay();
            } else {
              showGroupSettingOverlay(group);
            }
            e.preventDefault();
            return;
          }
          const groupSettingColorResetButton = findEventTargetByClassName(
            e,
            'tbs-group-setting-color-reset-button'
          );
          if (groupSettingColorResetButton !== null) {
            const group = getGroupFromSettingOverlray();
            if (group !== null && group['is_locked']) {
              return;
            }
            resetGroupColorOnSettingOverlay();
            e.preventDefault();
            return;
          }
          const groupSettingLockButton = findEventTargetByClassName(
            e,
            'tbs-group-setting-lock-button'
          );
          if (groupSettingLockButton !== null) {
            const group = getGroupFromSettingOverlray();
            const setResult = setGroupLockedFromSettingOverlay(true);
            if (setResult === null) {
              showGroupSettingOverlay(group);
              processFollowedSectionData();
            } else {
              const errorEl = document.getElementsByClassName(
                'tbs-group-settings-error'
              )[0];
              errorEl.style.display = 'block';
              errorEl.innerHTML = setResult;
            }
            e.preventDefault();
            return;
          }
          const groupSettingUnlockButton = findEventTargetByClassName(
            e,
            'tbs-group-setting-unlock-button'
          );
          if (groupSettingUnlockButton !== null) {
            const group = getGroupFromSettingOverlray();
            const setResult = setGroupLockedFromSettingOverlay(false);
            if (setResult === null) {
              showGroupSettingOverlay(group);
              processFollowedSectionData();
            } else {
              const errorEl = document.getElementsByClassName(
                'tbs-group-settings-error'
              )[0];
              errorEl.style.display = 'block';
              errorEl.innerHTML = setResult;
            }
            e.preventDefault();
            return;
          }
          const groupSettingCancelButton = findEventTargetByClassName(
            e,
            'tbs-group-setting-cancel-button'
          );
          if (groupSettingCancelButton !== null) {
            clearGroupSettingOverlay();
            e.preventDefault();
            return;
          }
          const groupSettingSaveButton = findEventTargetByClassName(
            e,
            'tbs-group-setting-save-button'
          );
          if (groupSettingSaveButton !== null) {
            const group = getGroupFromSettingOverlray();
            if (group !== null && group['is_locked']) {
              return;
            }
            const saveResult = saveGroupFromSettingOverlay();
            if (saveResult === null) {
              clearGroupSettingOverlay();
              processFollowedSectionData();
            } else {
              const errorEl = document.getElementsByClassName(
                'tbs-group-settings-error'
              )[0];
              errorEl.style.display = 'block';
              errorEl.innerHTML = saveResult;
            }
            e.preventDefault();
            return;
          }
          const groupSettingDeleteButton = findEventTargetByClassName(
            e,
            'tbs-group-setting-delete-button'
          );
          if (groupSettingDeleteButton !== null) {
            const group = getGroupFromSettingOverlray();
            if (group !== null && group['is_locked']) {
              return;
            }
            const deleteResult = deleteGroupFromSettingOverlay();
            if (deleteResult === null) {
              clearGroupSettingOverlay();
              processFollowedSectionData();
            } else {
              const errorEl = document.getElementsByClassName(
                'tbs-group-settings-error'
              )[0];
              errorEl.style.display = 'block';
              errorEl.innerHTML = deleteResult;
            }
            e.preventDefault();
            return;
          }

          const sideNavToggleButton = findEventTargetByClassName(
            e,
            'collapse-toggle'
          );
          if (sideNavToggleButton !== null) {
            setTimeout(() => {
              renderFollowedSection();
            }, 100);
            return;
          }

          const card = findEventTargetByClassName(
            e,
            'tbs-tw-side-nav-card__link'
          );
          if (card !== null) {
            if (card.classList.contains('tbs-group-header')) {
              const group_index = Number(card.dataset.tbsGroupIndex);
              const group = groups[group_index];
              setGroupOpened(group['group_name'], !group['is_opened']);
              clearGroupSettingOverlay();
              e.preventDefault();
              return;
            }
          }
          const link = findEventTargetByClassName(e, 'tbs-link');
          if (link !== null) {
            if (
              e.getModifierState('Alt') ||
              e.getModifierState('AltGraph') ||
              e.getModifierState('Control') ||
              e.getModifierState('Meta') ||
              e.getModifierState('OS') ||
              e.getModifierState('Shift')
            ) {
              return false;
            }
            const href = link.getAttribute('href');
            reactHistory.push(href);
            clearGroupSettingOverlay();
            e.preventDefault();
            return;
          }
          const group_setting = findEventTargetByClassName(
            e,
            'tbs-group-setting'
          );
          if (group_setting === null) {
            clearGroupSettingOverlay();
          }
        }
      },
      false
    );
    document.addEventListener(
      'mouseover',
      function (e) {
        if (dragged_card !== null) {
          return;
        }
        if (e.target) {
          const card = findEventTargetByClassName(
            e,
            'tbs-tw-side-nav-card__link'
          );
          if (card !== null) {
            if (card.classList.contains('tbs-group-item')) {
              const group_index = Number(card.dataset.tbsGroupIndex);
              const group = groups[group_index];
              const channel_name = card.dataset.tbsChannel;
              const channel_info = getChannelInfoByName(
                group['group_name'],
                channel_name
              );
              if (channel_info !== null) {
                showChannelOverlay(card, channel_info);
              }
              e.preventDefault();
              return;
            }
          }

          const cardOverlay = findEventTargetByClassName(e, 'tbs-card-overlay');
          if (cardOverlay !== null) {
            shouldShowCardOverlay = true;
            e.preventDefault();
            return;
          }
        }
      },
      false
    );
    document.addEventListener(
      'mouseout',
      function (e) {
        if (e.target) {
          const card = findEventTargetByClassName(
            e,
            'tbs-tw-side-nav-card__link'
          );
          if (card !== null) {
            if (card.classList.contains('tbs-group-item')) {
              shouldShowCardOverlay = false;
              debouncedClearCardOverlay();
              e.preventDefault();
              return;
            }
          }

          const cardOverlay = findEventTargetByClassName(e, 'tbs-card-overlay');
          if (cardOverlay !== null) {
            shouldShowCardOverlay = false;
            debouncedClearCardOverlay();
            e.preventDefault();
            return;
          }
        }
      },
      false
    );
    document.addEventListener(
      'dragstart',
      function (e) {
        if (e.target) {
          const card = findEventTargetByClassName(
            e,
            'tbs-tw-side-nav-card__link'
          );
          if (card !== null) {
            shouldShowCardOverlay = false;
            debouncedClearCardOverlay();
            dragged_card = card;
          }
        }
      },
      false
    );
    document.addEventListener(
      'dragend',
      function () {
        dragged_card = null;
      },
      false
    );
    document.addEventListener(
      'dragover',
      function (e) {
        // prevent default to allow drop
        e.preventDefault();
      },
      false
    );
    document.addEventListener(
      'drag',
      function (e) {
        if (dragged_card === null) {
          return;
        }
        const scrolling_height = 30;
        const scroll_speed = 5;
        const scroll_content_el = document.getElementsByClassName(
          'simplebar-scroll-content'
        )[0];
        const scroll_content_rect = scroll_content_el.getBoundingClientRect();
        if (e.clientY - scroll_content_rect.top < scrolling_height) {
          debouncedScrollOnDrag(scroll_content_el, -scroll_speed);
        }
        if (scroll_content_rect.bottom - e.clientY < scrolling_height) {
          debouncedScrollOnDrag(scroll_content_el, scroll_speed);
        }
      },
      false
    );
    document.addEventListener(
      'drop',
      function (e) {
        if (e.target) {
          const card = findEventTargetByClassName(
            e,
            'tbs-tw-side-nav-card__link'
          );
          if (card !== null && dragged_card !== null) {
            const dragged_group_index = Number(
              dragged_card.dataset.tbsGroupIndex
            );
            const group_index = Number(card.dataset.tbsGroupIndex);
            if (dragged_card.classList.contains('tbs-group-header')) {
              const group_rect = card
                .closest('.tbs-group')
                .getBoundingClientRect();
              if (dragged_group_index === group_index) {
                // do nothing
              } else if (dragged_group_index < group_index) {
                if (e.clientY < group_rect.top + group_rect.height / 2) {
                  moveGroupPosition(dragged_group_index, group_index - 1);
                } else {
                  moveGroupPosition(dragged_group_index, group_index);
                }
              } else {
                if (e.clientY < group_rect.top + group_rect.height / 2) {
                  moveGroupPosition(dragged_group_index, group_index);
                } else {
                  moveGroupPosition(dragged_group_index, group_index + 1);
                }
              }
            } else if (dragged_card.classList.contains('tbs-group-item')) {
              if (groups[group_index]['is_locked']) {
                return;
              }
              const dragged_channel_name = dragged_card.dataset.tbsChannel;
              moveChannelBetweenGroups(
                dragged_group_index,
                group_index,
                dragged_channel_name
              );
            }
            processFollowedSectionData();
            dragged_card = null;
            e.preventDefault();
            return;
          }
        }
        dragged_card = null;
      },
      false
    );
    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key === 'Escape') {
          clearGroupSettingOverlay();
        }
      },
      false
    );
  }

  /**
   * Get the first React state node from element
   * @param {Element} el Target element
   * @return {object} React state node
   */
  function getReactStateNode(el) {
    const key = Object.keys(el).find((key) =>
      key.startsWith('__reactInternalInstance$')
    );
    let reactObj = el[key];
    while (
      reactObj.stateNode === null ||
      reactObj.stateNode.refs === undefined
    ) {
      reactObj = reactObj.return;
      if (reactObj === undefined) {
        return null;
      }
    }
    return reactObj.stateNode;
  }

  /**
   * Get the first React Router history from element
   * @param {Element} el Target element
   * @return {object} React Router history
   */
  function getReactRouterHistory(el) {
    const key = Object.keys(el).find((key) =>
      key.startsWith('__reactInternalInstance$')
    );
    let reactObj = el[key];
    while (
      reactObj.stateNode === null ||
      reactObj.stateNode.props === undefined ||
      reactObj.stateNode.props.history === undefined
    ) {
      reactObj = reactObj.return;
      if (reactObj === undefined) {
        return null;
      }
    }
    return reactObj.stateNode.props.history;
  }

  /**
   * Catch updating event from `SideNavList(FOLLOWED_SECTION)` React Component and update TBS data and UI
   */
  function checkFollowingUiUpdated() {
    try {
      const followingEl = document.querySelector(
        '.side-nav-section:first-child'
      );
      const followingSn = getReactStateNode(followingEl);
      const followingOriginalComponentDidUpdate =
        followingSn.componentDidUpdate;
      followingSn.componentDidUpdate = function (
        prevProps,
        prevState,
        snapshot
      ) {
        console.log('[TBS] FOLLOWING REACT UPDATED');
        if (followingOriginalComponentDidUpdate !== undefined) {
          followingOriginalComponentDidUpdate.call(
            this,
            prevProps,
            prevState,
            snapshot
          );
        }
        debouncedRequestFollowedSectionData();
      };
    } catch (err) {
      setTimeout(checkFollowingUiUpdated, 500);
    }
  }

  /**
   * Catch updating event from `Root` React Component and update TBS data and UI
   */
  function checkRootUiUpdated() {
    try {
      const semiRootEl = document.getElementById('root').children[0];
      const semiRootSn = getReactStateNode(semiRootEl);
      reactHistory = getReactRouterHistory(semiRootEl);
      const semiRootOriginalComponentDidUpdate = semiRootSn.componentDidUpdate;
      semiRootSn.componentDidUpdate = function (
        prevProps,
        prevState,
        snapshot
      ) {
        console.log('[TBS] ROOT UPDATED');
        if (semiRootOriginalComponentDidUpdate !== undefined) {
          semiRootOriginalComponentDidUpdate.call(
            this,
            prevProps,
            prevState,
            snapshot
          );
        }
        // It should be call once, so restore original function here
        semiRootSn.componentDidUpdate = semiRootOriginalComponentDidUpdate;
        debouncedRequestFollowedSectionData();
        checkFollowingUiUpdated();
      };
      debouncedRequestFollowedSectionData();
    } catch (err) {
      setTimeout(checkRootUiUpdated, 500);
    }
  }

  // main script starts here

  if (!isAuthed()) {
    return;
  }

  loadGroups();
  injectStyle();
  registerEventListeners();

  window.addEventListener(
    'load',
    function () {
      checkRootUiUpdated();
      function periodicRequestFollowedSectionData() {
        debouncedRequestFollowedSectionData();
        setTimeout(periodicRequestFollowedSectionData, 1000 * 60 * 5);
      }
      periodicRequestFollowedSectionData();
    },
    false
  );
})();
