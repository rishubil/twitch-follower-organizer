// ==UserScript==
// @name        Twitch Follower Organizer
// @namespace   twitch-follower-organizer
// @version     0.1.8
// @author      Nesswit
// @description "We need better sidebar" - by wonzy_world, 2021
// @supportURL  https://github.com/rishubil/twitch-follower-organizer/issues
// @homepage    https://github.com/rishubil/twitch-follower-organizer/
// @downloadURL https://raw.githubusercontent.com/rishubil/twitch-follower-organizer/master/twitch-follower-organizer.user.js
// @updateURL   https://raw.githubusercontent.com/rishubil/twitch-follower-organizer/master/twitch-follower-organizer.user.js
// @include     *://*.twitch.tv/*
// @require     https://cdn.jsdelivr.net/npm/lodash@4.17.20/lodash.min.js
// @run-at      document-start
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// ==/UserScript==

// Define global objects for eslint
/* globals GM_addStyle, GM_setValue, GM_getValue, _ */

(function () {
  'use strict';

  const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const UNKNOWN_GROUP_NAME = 'ETC';

  /**
   * User defined channel group, with some states and options
   * @typedef {object} Group
   * @property {string} group_name - The name of group
   * @property {boolean} is_opened - The state of group is opened or not
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
  let dragged_card = false;

  /**
   * Load groups from GM storage
   */
  function loadGroups() {
    const default_groups = [
      {
        group_name: UNKNOWN_GROUP_NAME,
        is_opened: false,
        hide_offline: true,
        color: '#a970ff',
        channels: null,
      },
    ];
    groups = GM_getValue('groups', default_groups);
  }

  /**
   * Save groups to GM storage
   */
  function saveGroups() {
    GM_setValue('groups', groups);
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
    groups.splice(groups.length, 0, {
      group_name: group_name,
      is_opened: false,
      hide_offline: true,
      color: '#a970ff',
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
   */
  function removeGroup(group_name) {
    const group_index = findGroupIndexByName(group_name);
    if (findGroupIndexByName(group_name) === -1) {
      return;
    }
    groups.splice(group_index, 1);
    saveGroups();
  }

  /**
   * Move channel between speific groups using index and channel name
   * @param {number} source_group_index Source group index
   * @param {number} target_group_index Target group index
   * @param {string} channel_name Channel name to move
   */
  function moveChannelBetweenGroups(
    source_group_index,
    target_group_index,
    channel_name
  ) {
    if (source_group_index === target_group_index) {
      return;
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
    group['is_opened'] = is_opened;
    saveGroups();
    renderFollowedSection();
  }

  /**
   * Update `hide_offline` of group by group name
   *
   * This function will save the new groups and render UI.
   * If there is no group named `group_name`, do nothing.
   *
   * @param {string} group_name The name of group
   * @param {boolean} hide_offline `hide_offline` value to set
   */
  function setHideOffline(group_name, hide_offline) {
    const group = getGroupByName(group_name);
    if (group === null) {
      return;
    }
    group['hide_offline'] = hide_offline;
    saveGroups();
    renderFollowedSection();
  }

  /**
   * Update `color` of group by group name
   *
   * This function will save the new groups and render UI.
   * If there is no group named `group_name`, do nothing.
   *
   * @param {string} group_name The name of group
   * @param {string} color `color` value to set
   */
  function setColor(group_name, color) {
    const group = getGroupByName(group_name);
    if (group === null) {
      return;
    }
    group['color'] = color;
    saveGroups();
    renderFollowedSection();
  }

  /**
   * Change group name
   *
   * This function will save the new groups and render UI.
   * If there is no group named `old_name`, do nothing.
   *
   * @param {string} old_name The name of target group to change name
   * @param {string} new_name The new name of group
   * @throws If there is the group named `new_name`
   */
  function changeGroupName(old_name, new_name) {
    if (new_name === UNKNOWN_GROUP_NAME) {
      throw new Error('ALREADY_EXIST');
    }
    if (findGroupIndexByName(new_name) !== -1) {
      throw new Error('ALREADY_EXIST');
    }
    const group = getGroupByName(old_name);
    if (group === null) {
      return;
    }
    group['group_name'] = new_name;
    saveGroups();
    renderFollowedSection();
  }

  /**
   * Update `channels` of group by group name
   *
   * This function will save the new groups and render UI.
   * If there is no group named `group_name`, do nothing.
   *
   * @param {string} group_name The name of group
   * @param {string[]} channels `channels` value to set
   */
  function setGroupChannels(group_name, channels) {
    const group = getGroupByName(group_name);
    if (group === null) {
      return;
    }
    group['channels'] = channels;
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
      .tw-channel-status-indicator {
        background-color: var(--color-fill-live);
        border-radius: var(--border-radius-rounded);
        width: 0.8rem;
        height: 0.8rem;
        display: inline-block;
        position: relative;
      }
      .tw-channel-status-indicator.tbs-offline {
        background-color: #717171;
      }
      .tw-aspect {
        position: relative;
        width: 100%;
        overflow: hidden;
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
      .tbs-group-header .side-nav-card__live-status {
        display: none;
      }
      .tbs-group-header:hover .side-nav-card__live-status {
        display: block;
      }
      .tbs-group-item {
        background: #18181b;
      }
      .tbs-group-item {
        border-left: 0.2rem solid #6441a4;
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
      .tbs-group-setting {
        width: 22rem;
      }
      .tbs-group-settings-error {
        display: none;
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
      '.side-nav-section:first-child .side-nav-header h5'
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
            class="tbs-add-group-button tw-align-items-center tw-align-middle tw-border-bottom-left-radius-medium tw-border-bottom-right-radius-medium tw-border-top-left-radius-medium tw-border-top-right-radius-medium tw-button-icon tw-core-button tw-inline-flex tw-justify-content-center tw-overflow-hidden tw-relative tw-mg-l-1"><span
                class="tw-button-icon__icon">
                <div style="width: 2rem; height: 2rem;">
                    <div class="tw-icon">
                        <div class="tw-aspect">
                          <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" stroke-width="2" stroke="#efeff1" fill="none" stroke-linecap="round" stroke-linejoin="round">
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
      return channel_info.content.viewersCount !== undefined;
    });
    const total_live_string = _.sumBy(channel_infos, function (channel_info) {
      if (channel_info.content.viewersCount !== undefined) {
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
        if (
          channel_info.content.viewersCount !== undefined ||
          !group['hide_offline']
        ) {
          group_item_html += generateTbsGroupItemHtml(
            group_index,
            channel_info
          );
        }
      }
    }

    const templateTbsGroup = _.template(/*html*/ `
      <div class="tbs-group">
        <div class="tw-transition tw-transition--enter-done tw-transition__scale-over tw-transition__scale-over--enter-done"
          style="transition: transform 250ms ease 0ms, opacity;">
          <div>
            <div class="side-nav-card tw-relative" data-test-selector="side-nav-card"><a
                class="tbs-group-header side-nav-card__link tw-align-items-center tw-flex tw-flex-nowrap tw-full-width tw-link tw-link--hover-underline-none tw-pd-x-1 tw-pd-y-05"
                data-tbs-group-index="<%- group_index %>" href="#" draggable="true">
                <div class="side-nav-card__avatar tw-align-items-center tw-flex-shrink-0">
                  <figure aria-label="<%- group['group_name'] %>" class="tw-avatar tw-avatar--size-30">
                    <% if (group['is_opened']) { %>
                      <svg xmlns="http://www.w3.org/2000/svg" class="tw-block tw-image tw-image-avatar" alt="<%- group['group_name'] %>" width="30" height="30" viewBox="0 0 24 24" stroke-width="2" stroke="<%- group['color'] %>" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <path d="M9 4h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
                        <path d="M17 17v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h2" />
                      </svg>
                    <% } else { %>
                      <svg xmlns="http://www.w3.org/2000/svg" class="tw-block tw-image tw-image-avatar" alt="<%- group['group_name'] %>" width="30" height="30" viewBox="0 0 24 24" stroke-width="2" stroke="<%- group['color'] %>" fill="none" stroke-linecap="round" stroke-linejoin="round">
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
                <div class="tw-ellipsis tw-flex tw-full-width tw-justify-content-between">
                  <div data-a-target="side-nav-card-metadata" class="tw-ellipsis tw-full-width tw-mg-l-1">
                    <div class="side-nav-card__title tw-align-items-center tw-flex">
                      <p data-a-target="side-nav-title"
                        class="tw-c-text-alt tw-ellipsis tw-ellipsis tw-flex-grow-1 tw-font-size-5 tw-line-height-heading tw-semibold"
                        title="<%- group['group_name'] %> (<%- total_live_string %>/<%- channel_infos.length %>)"><span><%- group['group_name'] %> (<%- total_live_string %>/<%- channel_infos.length %>)</span></p>
                    </div>
                    <div class="side-nav-card__metadata tw-pd-r-05" data-a-target="side-nav-game-title">
                      <p class="tw-c-text-alt-2 tw-ellipsis tw-font-size-6 tw-line-height-heading"
                        title="<%- display_names_string %>"><%- display_names_string %></p>
                    </div>
                  </div><div class="side-nav-card__live-status tw-flex-shrink-0 tw-mg-l-05"
                      data-a-target="side-nav-live-status">
                      <button aria-label="그룹 수정"
                        class="tbs-edit-button tw-align-items-center tw-align-middle tw-border-bottom-left-radius-medium tw-border-bottom-right-radius-medium tw-border-top-left-radius-medium tw-border-top-right-radius-medium tw-button-icon tw-core-button tw-inline-flex tw-justify-content-center tw-overflow-hidden tw-relative"
                        data-tbs-group-index="<%- group_index %>"><span
                            class="tw-button-icon__icon">
                            <div style="width: 2rem; height: 2rem;">
                                <div class="tw-icon">
                                    <div class="tw-aspect">
                                      <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" stroke-width="2" stroke="#dedee3" fill="none" stroke-linecap="round" stroke-linejoin="round">
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
      <div class="tw-transition tw-transition--enter-done tw-transition__scale-over tw-transition__scale-over--enter-done"
        style="transition: transform 250ms ease 0ms, opacity;">
        <div>
          <div class="side-nav-card tw-relative" data-test-selector="side-nav-card"><a
              class="tbs-group-item tbs-link side-nav-card__link tw-align-items-center tw-flex tw-flex-nowrap tw-full-width tw-link tw-link--hover-underline-none tw-pd-x-1 tw-pd-y-05"
              data-test-selector="followed-channel" data-tbs-group-index="<%- group_index %>" data-tbs-channel="<%-  channel_info.user.login %>" href="/<%- channel_info.user.login %>" draggable="true">
              <div class="side-nav-card__avatar <% if (!is_live) { %>side-nav-card__avatar--offline <% } %>tw-align-items-center tw-flex-shrink-0">
                <figure aria-label="<%- channel_info.user.displayName %> (<%- channel_info.user.login %>)" class="tw-avatar tw-avatar--size-30"><img
                    class="tw-block tw-border-radius-rounded tw-image tw-image-avatar"
                    alt="<%- channel_info.user.displayName %> (<%- channel_info.user.login %>)"
                    src="<%- channel_info.user.profileImageURL %>">
                </figure>
              </div>
              <div class="tw-ellipsis tw-flex tw-full-width tw-justify-content-between">
                <div data-a-target="side-nav-card-metadata" class="tw-ellipsis tw-full-width tw-mg-l-1">
                  <div class="side-nav-card__title tw-align-items-center tw-flex">
                    <p data-a-target="side-nav-title"
                      class="tw-c-text-alt tw-ellipsis tw-ellipsis tw-flex-grow-1 tw-font-size-5 tw-line-height-heading tw-semibold"
                      title="<%- channel_info.user.displayName %> (<%- channel_info.user.login %>)"><span><%- channel_info.user.displayName %> <span
                          class="intl-login">(<%- channel_info.user.login %>)</span></span></p>
                  </div>
                  <div class="side-nav-card__metadata tw-pd-r-05" data-a-target="side-nav-game-title">
                    <% if (is_live && channel_info.content.game !== null) { %>
                      <p class="tw-c-text-alt-2 tw-ellipsis tw-font-size-6 tw-line-height-heading"
                        title="<%- channel_info.content.game.displayName %>"><%- channel_info.content.game.displayName %></p>
                    <% } else if (!is_live && channel_info.content.edges.length > 0) { %>
                      <p class="tw-c-text-alt-2 tw-ellipsis tw-font-size-6 tw-line-height-heading"
                        title="새 동영상 <%- channel_info.content.edges.length.toLocaleString() %>개">새 동영상 <%- channel_info.content.edges.length.toLocaleString() %>개</p>
                    <% } else { %>
                      <p class="tw-c-text-alt-2 tw-ellipsis tw-font-size-6 tw-line-height-heading"></p>
                    <% } %>
                  </div>
                </div>
                <div class="side-nav-card__live-status tw-flex-shrink-0 tw-mg-l-05"
                  data-a-target="side-nav-live-status">
                  <% if (is_live) { %>
                    <div class="tw-align-items-center tw-flex">
                      <div class="ScChannelStatusIndicator-sc-1cf6j56-0 fSVvnY tw-channel-status-indicator"
                        data-test-selector="0"></div>
                      <div class="tw-mg-l-05"><span data-test-selector="1" aria-label="시청자 <%- channel_info.content.viewersCount.toLocaleString() %>명"
                          class="tw-c-text-alt tw-font-size-6"><%- channel_info.content.viewersCount.toLocaleString() %></span></div>
                    </div>
                  <% } else { %>
                    <span class="tw-c-text-alt tw-font-size-6">오프라인</span>
                  <% } %>
                </div>
              </div>
            </a></div>
        </div>
      </div>
    `);
    return templateTbsGroupItem({
      group_index: group_index,
      channel_info: channel_info,
      is_live: channel_info.content.viewersCount !== undefined,
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
   * Clear all contents in overlay
   */
  function clearOverlay() {
    const tbsoEl = getOverlay();
    tbsoEl.innerHTML = '';
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
      <div class="tw-transition tw-transition--enter-done tw-transition__fade tw-transition__fade--enter-done"
        style="transition-delay: 0ms; transition-duration: 250ms;">
        <div class="tw-pd-l-1">
          <div class="tw-balloon tw-border-radius-large tw-c-background-base tw-c-text-inherit tw-elevation-2 tw-inline-block" role="dialog">
            <div class="tw-pd-x-05 tw-pd-y-05">
            <% if (is_live) { %>
              <div class="online-side-nav-channel-tooltip__body tw-pd-x-05">
                <p class="tw-c-text-base tw-ellipsis tw-line-clamp-2"><%- channel_info.user.broadcastSettings.title %></p>
              </div>
            <% } else { %>
              <div>
                <% for (let i = 0; i < channel_info.content.edges.length; i++) {
                  const node = channel_info.content.edges[i].node; %>
                  <a class="tbs-link tw-block tw-full-width tw-interactable tw-interactable--default tw-interactable--hover-enabled"
                    href="/videos/<%- node.id %>">
                    <div class="tw-pd-x-05 tw-pd-y-05">
                      <div class="tw-card tw-relative">
                        <div class="tw-align-items-center tw-flex tw-flex-nowrap tw-flex-row">
                          <div class="tw-border-radius-small tw-card-img tw-card-img--size-8 tw-flex-shrink-0 tw-overflow-hidden">
                            <div class="ScAspectRatio-sc-1sw3lwy-1 dNNaBC tw-aspect">
                              <div class="ScAspectSpacer-sc-1sw3lwy-0 hhnnBG"></div><img alt="<%- node.title %>"
                                class="tw-image" src="<%- node.previewThumbnailURL %>">
                            </div>
                          </div>
                          <div class="tw-card-body tw-relative">
                            <div class="offline-side-nav-channel-tooltip__video-body tw-pd-l-1 tw-pd-r-1">
                              <p class="tw-c-text-base tw-ellipsis tw-line-clamp-2" title="<%- node.title %>"><%- node.title %></p>
                              <p data-test-selector="offline-followed-channel-tooltip-text"
                                class="tw-c-text-alt-2"><%- node.viewCount.toLocaleString() %>회 시청</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </a>
                <% } %>
                <a class="tbs-link tw-block tw-full-width tw-interactable tw-interactable--default tw-interactable--hover-enabled"
                  href="/<%- channel_info.user.login %>/videos/all">
                  <div class="tw-align-center tw-pd-05">
                    <p class="tw-c-text-base">최근 동영상 모두 보기</p>
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
      is_live: channel_info.content.viewersCount !== undefined,
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
    let groupSettingEl = document.getElementsByClassName('tbs-group-setting');
    if (groupSettingEl.length === 0) {
      return;
    } else {
      groupSettingEl = groupSettingEl[0];
    }
    const target_group_name = groupSettingEl.dataset.tbsGroupName;

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

    const sideBarEl = document.getElementById('sideNav');
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
      <div class="tw-transition tw-transition--enter-done tw-transition__fade tw-transition__fade--enter-done"
        style="transition-delay: 0ms; transition-duration: 250ms;">
        <div class="tw-pd-l-1">
          <div class="tw-balloon tw-border-radius-large tw-c-background-base tw-c-text-inherit tw-elevation-2 tw-inline-block" role="dialog">
            <div class="tbs-group-setting tw-pd-x-05 tw-pd-y-05" data-tbs-group-name="<%- group['group_name'] %>">
              <div class="tw-pd-1">
                <div class="tw-flex-grow-1 tw-font-size-6 tw-form-group tw-relative">
                  <div>
                    <div class="tw-mg-b-05">
                      <label class="tw-form-label">그룹 제목</label>
                    </div>
                    <input type="text"
                      class="tbs-group-setting-group-name tw-block tw-border-bottom-left-radius-medium tw-border-bottom-right-radius-medium tw-border-top-left-radius-medium tw-border-top-right-radius-medium tw-font-size-6 tw-full-width tw-input tw-pd-l-1 tw-pd-r-1 tw-pd-y-05"
                      autocapitalize="off" autocorrect="off" autocomplete="off"
                      spellcheck="false" value="<%- group['group_name'] %>"<% if (is_unknown_group) { %> disabled="disabled"<% } %>>
                  </div>
                  <div>
                    <div class="tw-mg-b-05 tw-mg-t-1">
                      <label class="tw-form-label">색상</label>
                    </div>
                    <input type="text"
                      class="tbs-group-setting-color tw-block tw-border-bottom-left-radius-medium tw-border-bottom-right-radius-medium tw-border-top-left-radius-medium tw-border-top-right-radius-medium tw-font-size-6 tw-full-width tw-input tw-pd-l-1 tw-pd-r-1 tw-pd-y-05"
                      autocapitalize="off" autocorrect="off" autocomplete="off"
                      spellcheck="false" value="<%- group['color'] %>">
                  </div>
                  <div>
                    <div class="tw-mg-b-05 tw-mg-t-1">
                      <label class="tw-form-label">오프라인 채널 표시 여부</label>
                    </div>
                    <select
                      class="tbs-group-setting-hide-offline tw-block tw-border-radius-medium tw-font-size-6 tw-full-width tw-pd-l-1 tw-pd-r-3 tw-pd-y-05 tw-select">
                      <option value="false"<% if (!group['hide_offline']) { %>selected="selected"<% } %>>표시함</option>
                      <option value="true"<% if (group['hide_offline']) { %>selected="selected"<% } %>>표시하지 않음</option>
                    </select>
                  </div>
                </div>
                <div class="tw-mg-t-1 tw-align-items-center tw-flex tw-flex-grow-1 tw-flex-shrink-1 tw-full-width tw-justify-content-between">
                  <% if (!is_unknown_group) { %>
                    <button aria-label="삭제"
                    class="tbs-group-setting-delete-button tw-align-items-center tw-align-middle tw-border-bottom-left-radius-medium tw-border-bottom-right-radius-medium tw-border-top-left-radius-medium tw-border-top-right-radius-medium tw-button-icon tw-core-button tw-inline-flex tw-justify-content-center tw-overflow-hidden tw-relative"><span
                      class="tw-button-icon__icon">
                      <div style="width: 2rem; height: 2rem;">
                        <div class="tw-icon">
                          <div class="tw-aspect">
                            <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" stroke-width="2" stroke="#e91916" fill="none" stroke-linecap="round" stroke-linejoin="round">
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
                  <% } else { %>
                    <div></div>
                  <% } %>
                  <div>
                    <button aria-label="취소"
                      class="tbs-group-setting-cancel-button tw-align-items-center tw-align-middle tw-border-bottom-left-radius-medium tw-border-bottom-right-radius-medium tw-border-top-left-radius-medium tw-border-top-right-radius-medium tw-button-icon tw-core-button tw-inline-flex tw-justify-content-center tw-overflow-hidden tw-relative"><span
                        class="tw-button-icon__icon">
                        <div style="width: 2rem; height: 2rem;">
                          <div class="tw-icon">
                            <div class="tw-aspect">
                              <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" stroke-width="2" stroke="#efeff1" fill="none" stroke-linecap="round" stroke-linejoin="round">
                                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </span></button>
                    <button aria-label="저장"
                      class="tbs-group-setting-save-button tw-align-items-center tw-align-middle tw-border-bottom-left-radius-medium tw-border-bottom-right-radius-medium tw-border-top-left-radius-medium tw-border-top-right-radius-medium tw-button-icon tw-core-button tw-inline-flex tw-justify-content-center tw-overflow-hidden tw-relative"><span
                        class="tw-button-icon__icon">
                        <div style="width: 2rem; height: 2rem;">
                          <div class="tw-icon">
                            <div class="tw-aspect">
                              <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" stroke-width="2" stroke="#efeff1" fill="none" stroke-linecap="round" stroke-linejoin="round">
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
  function findEventTargetbyClassName(
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
          const addGroupButton = findEventTargetbyClassName(
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
          const editButton = findEventTargetbyClassName(e, 'tbs-edit-button');
          if (editButton !== null) {
            const group_index = Number(editButton.dataset.tbsGroupIndex);
            const group = groups[group_index];
            showGroupSettingOverlay(group);
            e.preventDefault();
            return;
          }
          const groupSettingCancelButton = findEventTargetbyClassName(
            e,
            'tbs-group-setting-cancel-button'
          );
          if (groupSettingCancelButton !== null) {
            clearGroupSettingOverlay();
            e.preventDefault();
            return;
          }
          const groupSettingSaveButton = findEventTargetbyClassName(
            e,
            'tbs-group-setting-save-button'
          );
          if (groupSettingSaveButton !== null) {
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
          const groupSettingDeleteButton = findEventTargetbyClassName(
            e,
            'tbs-group-setting-delete-button'
          );
          if (groupSettingDeleteButton !== null) {
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
          const card = findEventTargetbyClassName(e, 'side-nav-card__link');
          if (card !== null) {
            if (card.classList.contains('tbs-group-header')) {
              const group_index = Number(card.dataset.tbsGroupIndex);
              const group = groups[group_index];
              setGroupOpened(group['group_name'], !group['is_opened']);
              e.preventDefault();
              return;
            }
          }
          const link = findEventTargetbyClassName(e, 'tbs-link');
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
            e.preventDefault();
            return;
          }
        }
      },
      false
    );
    document.addEventListener(
      'mouseover',
      function (e) {
        if (dragged_card != null) {
          return;
        }
        if (e.target) {
          const card = findEventTargetbyClassName(e, 'side-nav-card__link');
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

          const cardOverlay = findEventTargetbyClassName(e, 'tbs-card-overlay');
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
          const card = findEventTargetbyClassName(e, 'side-nav-card__link');
          if (card !== null) {
            if (card.classList.contains('tbs-group-item')) {
              shouldShowCardOverlay = false;
              debouncedClearCardOverlay();
              e.preventDefault();
              return;
            }
          }

          const cardOverlay = findEventTargetbyClassName(e, 'tbs-card-overlay');
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
          const card = findEventTargetbyClassName(e, 'side-nav-card__link');
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
        if (dragged_card == null) {
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
          const card = findEventTargetbyClassName(e, 'side-nav-card__link');
          if (card !== null && dragged_card !== null) {
            const dragged_group_index = Number(
              dragged_card.dataset.tbsGroupIndex
            );
            const group_index = Number(card.dataset.tbsGroupIndex);
            if (dragged_card.classList.contains('tbs-group-header')) {
              moveGroupPosition(dragged_group_index, group_index);
            } else if (dragged_card.classList.contains('tbs-group-item')) {
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
