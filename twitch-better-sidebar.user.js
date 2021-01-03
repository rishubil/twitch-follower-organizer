// ==UserScript==
// @name        Twitch Better Sidebar
// @namespace   twitch-better-sidebar
// @version     0.0.1
// @author      Nesswit
// @description "We need better sidebar" - by wonzy_world, 2021
// @include     *://*.twitch.tv/*
// @require     https://cdn.jsdelivr.net/npm/lodash@4.17.20/lodash.min.js
// @run-at      document-start
// @grant       GM_addStyle
// @grant       GM_setValue
// @grant       GM_getValue
// ==/UserScript==

// Icons from Tabler Icons (https://tablericons.com/)

(function () {
  'use strict';

  const CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
  const UNKNOWN_GROUP_NAME = 'ETC';

  /**
   * User defined channel group, with some states and options
   * @typedef {Object} Group
   * @property {string} group_name - The name of group
   * @property {boolean} is_opened - The state of group is opened or not
   * @property {boolean} hide_offline - Whether to show channels that are offline
   * @property {?string[]} channels - List of channels in the group (UNKNOWN group has null value)
   */

  /**
   * Channel infomation from Twitch API
   * @typedef {ojbect} ChannelInfo
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
   * Twitch react router's history object
   */
  let reactHistory = null;

  /**
   * Load groups from GM storage
   */
  function loadGroups() {
    const default_groups = [{
      'group_name': UNKNOWN_GROUP_NAME,
      'is_opened': false,
      'hide_offline': true,
      'channels': null
    }];
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
    return _.findIndex(groups, { 'group_name': group_name });
  }

  /**
   * Add group to groups with name and save
   *
   * Added group will be inserted before UNKNOWN group.
   *
   * @param {string} group_name The name of group
   * @throws If there is the group named `group_name`
   */
  function addGroup(group_name) {
    if (findGroupIndexByName(group_name) !== -1) {
      throw new Error('ALREADY_EXIST');
    }
    groups.splice(groups.length - 1, 0, {
      'group_name': group_name,
      'is_opened': false,
      'hide_offline': true,
      'channels': []
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
      return groups[groups.length - 1];
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
    return token !== ''
  }

  /**
   * Inject CSS styles
   */
  function injectStyle() {
    GM_addStyle(`
      .side-nav-section:first-child .tw-transition {
        display: none!important;
      }
      .side-nav-section:first-child .side-nav-show-more-toggle__button {
        display: none!important;
      }
      .side-nav-section:first-child .twitch-better-sidebar .tw-transition {
        display: block!important;
      }
      .tbs-group-item {
        background: #18181b;
      }
      .tbs-group-item {
        border-left: 0.2rem solid #6441a4;
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

    fetch('https://gql.twitch.tv/gql', {
      'method': 'POST',
      'headers': {
        'connection': 'keep-alive',
        'authorization': 'OAuth ' + token,
        'dnt': '1',
        'accept-language': 'ko-KR',
        'client-id': CLIENT_ID,
        'x-device-id': unique_id,
        'content-type': 'text/plain;charset=UTF-8',
        'accept': '*/*',
        'origin': 'https://www.twitch.tv',
        'sec-fetch-site': 'same-site',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        'referer': 'https://www.twitch.tv/'
      },
      'body': `[
        {
          "operationName": "PersonalSections",
          "variables": {
            "input": {
              "sectionInputs": [
                "FOLLOWED_SECTION"
              ],
              "recommendationContext": {
                "platform": "web"
              }
            },
            "channelLogin": null,
            "withChannelUser": false
          },
          "extensions": {
            "persistedQuery": {
              "version": 1,
              "sha256Hash": "469efc9442aa2b7634a3ab36eae1778b78ec7ccf062d2b17833afb0e66b78a25"
            }
          }
        }
      ]`
    })
      .then(response => response.json())
      .then(data => {
        processFollowedSectionData(data);
      });
  }

  /**
   * Convert raw data into `grouped_channel_infos`
   * 
   * It will call {@link renderFollowedSection}.
   * 
   * @param {object} data response data from Twitch API
   */
  function processFollowedSectionData(data) {
    // clear old grouped_channel_infos and set default values
    grouped_channel_infos = {};
    for (let group_index = 0; group_index < groups.length; group_index++) {
      const group = groups[group_index];
      grouped_channel_infos[group['group_name']] = [];
    }

    // append ChannelInfo to each group
    const channel_infos = data[0].data.personalSections[0].items;
    for (let index = 0; index < channel_infos.length; index++) {
      const channel_info = channel_infos[index];
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
    const transitionGroupEl = document.querySelector('.side-nav-section:first-child .tw-transition-group');
    if (transitionGroupEl === null) {
      console.log('[TBS] transitionGroup is not loaded');
      return;
    }

    let tbsEl = transitionGroupEl.getElementsByClassName('twitch-better-sidebar');
    if (tbsEl.length === 0) {
      tbsEl = document.createElement('div');
      tbsEl.classList.add('twitch-better-sidebar');
      transitionGroupEl.appendChild(tbsEl);
    } else {
      tbsEl = tbsEl[0];
    }

    let tbsHtml = '';
    let group_index = 0;
    for (let group_index = 0; group_index < groups.length; group_index++) {
      const group = groups[group_index];
      const channel_infos = grouped_channel_infos[group['group_name']];
      tbsHtml += generateTbsGroupHtml(group_index, channel_infos);
    }
    tbsEl.innerHTML = tbsHtml;
  }

  /**
   * Generate HTML string of group to render
   * @param {number} group_index The index of groups
   * @param {ChannelInfo[]} channel_infos List of ChannelInfo in the group
   * @return {string} Generated HTML string
   */
  function generateTbsGroupHtml(group_index, channel_infos) {
    const group = groups[group_index];
    const display_names_string = _.join(_.map(channel_infos, function (channel_info) {
      return channel_info.user.displayName
    }), ', ');
    const is_someone_live = _.some(channel_infos, function (channel_info) {
      return channel_info.content.viewersCount !== undefined;
    });
    const total_viewers_string = _.sumBy(channel_infos, function (channel_info) {
      if (channel_info.content.viewersCount !== undefined) {
        return channel_info.content.viewersCount;
      }
      return 0;
    }).toLocaleString();
    let group_item_html = '';
    if (group['is_opened']) {
      for (let channel_info_index = 0; channel_info_index < channel_infos.length; channel_info_index++) {
        const channel_info = channel_infos[channel_info_index];
        // render live channels, and if hide_offline is false, render offline channels too.
        if (channel_info.content.viewersCount !== undefined || !group['hide_offline']) {
          group_item_html += generateTbsGroupItemHtml(channel_info);
        }
      }
    }
    return `<div class="tbs-group">
      <div class="tw-transition tw-transition--enter-done tw-transition__scale-over tw-transition__scale-over--enter-done"
        style="transition: transform 250ms ease 0ms, opacity;">
        <div>
          <div class="side-nav-card tw-relative" data-test-selector="side-nav-card"><a
              class="tbs-group-header side-nav-card__link tw-align-items-center tw-flex tw-flex-nowrap tw-full-width tw-link tw-link--hover-underline-none tw-pd-x-1 tw-pd-y-05"
              data-tbs-group-index="${group_index}" href="#">
              <div class="side-nav-card__avatar tw-align-items-center tw-flex-shrink-0">
                <figure aria-label="${group['group_name']}" class="tw-avatar tw-avatar--size-30">`
      + (group['is_opened']
        ? `<svg xmlns="http://www.w3.org/2000/svg" class="tw-block tw-border-radius-rounded tw-image tw-image-avatar" alt="${group['group_name']}" width="28" height="28" viewBox="0 0 24 24" stroke-width="2" stroke="#a970ff" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <path d="M9 4h3l2 2h5a2 2 0 0 1 2 2v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2" />
                    <path d="M17 17v2a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2h2" />
                  </svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" class="tw-block tw-border-radius-rounded tw-image tw-image-avatar" alt="${group['group_name']}" width="28" height="28" viewBox="0 0 24 24" stroke-width="2" stroke="#a970ff" fill="none" stroke-linecap="round" stroke-linejoin="round">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2" />
                  </svg>`
      ) + `</figure>
              </div>
              <div class="tw-ellipsis tw-flex tw-full-width tw-justify-content-between">
                <div data-a-target="side-nav-card-metadata" class="tw-ellipsis tw-full-width tw-mg-l-1">
                  <div class="side-nav-card__title tw-align-items-center tw-flex">
                    <p data-a-target="side-nav-title"
                      class="tw-c-text-alt tw-ellipsis tw-ellipsis tw-flex-grow-1 tw-font-size-5 tw-line-height-heading tw-semibold"
                      title="${group['group_name']}"><span>${group['group_name']}</span></p>
                  </div>
                  <div class="side-nav-card__metadata tw-pd-r-05" data-a-target="side-nav-game-title">
                    <p class="tw-c-text-alt-2 tw-ellipsis tw-font-size-6 tw-line-height-heading"
                      title="${display_names_string}">${display_names_string}</p>
                  </div>
                </div>`
      + (is_someone_live
        ? `<div class="side-nav-card__live-status tw-flex-shrink-0 tw-mg-l-05"
                    data-a-target="side-nav-live-status">
                    <div class="tw-align-items-center tw-flex">
                      <div class="ScChannelStatusIndicator-sc-1cf6j56-0 fSVvnY tw-channel-status-indicator"
                        data-test-selector="0"></div>
                      <div class="tw-mg-l-05"><span aria-label="시청자 ${total_viewers_string}명"
                          class="tw-c-text-alt tw-font-size-6">${total_viewers_string}</span></div>
                    </div>
                  </div>`
        : `<div class="side-nav-card__live-status tw-flex-shrink-0 tw-mg-l-05"
                    data-a-target="side-nav-live-status"><span
                      class="tw-c-text-alt tw-font-size-6">오프라인</span></div>`
      ) + `</div>
            </a></div>
        </div>
      </div>` + group_item_html + `
    </div>`;
  }

  /**
   * Generate HTML string of channel to render
   * @param {ChannelInfo} channel_info ChannelInfo to render
   * @return {string} Generated HTML string
   */
  function generateTbsGroupItemHtml(channel_info) {
    const is_live = channel_info.content.viewersCount !== undefined;
    if (is_live) {
      return `<div class="tw-transition tw-transition--enter-done tw-transition__scale-over tw-transition__scale-over--enter-done"
        style="transition: transform 250ms ease 0ms, opacity;">
        <div>
          <div class="side-nav-card tw-relative" data-test-selector="side-nav-card"><a
              class="tbs-group-item side-nav-card__link tw-align-items-center tw-flex tw-flex-nowrap tw-full-width tw-link tw-link--hover-underline-none tw-pd-x-1 tw-pd-y-05"
              data-test-selector="followed-channel" href="/${channel_info.user.login}">
              <div class="side-nav-card__avatar tw-align-items-center tw-flex-shrink-0">
                <figure aria-label="${channel_info.user.displayName} (${channel_info.user.login})" class="tw-avatar tw-avatar--size-30"><img
                    class="tw-block tw-border-radius-rounded tw-image tw-image-avatar"
                    alt="${channel_info.user.displayName} (${channel_info.user.login})"
                    src="${channel_info.user.profileImageURL}">
                </figure>
              </div>
              <div class="tw-ellipsis tw-flex tw-full-width tw-justify-content-between">
                <div data-a-target="side-nav-card-metadata" class="tw-ellipsis tw-full-width tw-mg-l-1">
                  <div class="side-nav-card__title tw-align-items-center tw-flex">
                    <p data-a-target="side-nav-title"
                      class="tw-c-text-alt tw-ellipsis tw-ellipsis tw-flex-grow-1 tw-font-size-5 tw-line-height-heading tw-semibold"
                      title="${channel_info.user.displayName} (${channel_info.user.login})"><span>${channel_info.user.displayName} <span
                          class="intl-login">(${channel_info.user.login})</span></span></p>
                  </div>
                  <div class="side-nav-card__metadata tw-pd-r-05" data-a-target="side-nav-game-title">
                    <p class="tw-c-text-alt-2 tw-ellipsis tw-font-size-6 tw-line-height-heading"
                      title="${channel_info.content.game.displayName}">${channel_info.content.game.displayName}</p>
                  </div>
                </div>
                <div class="side-nav-card__live-status tw-flex-shrink-0 tw-mg-l-05"
                  data-a-target="side-nav-live-status">
                  <div class="tw-align-items-center tw-flex">
                    <div class="ScChannelStatusIndicator-sc-1cf6j56-0 fSVvnY tw-channel-status-indicator"
                      data-test-selector="0"></div>
                    <div class="tw-mg-l-05"><span data-test-selector="1" aria-label="시청자 ${channel_info.content.viewersCount.toLocaleString()}명"
                        class="tw-c-text-alt tw-font-size-6">${channel_info.content.viewersCount.toLocaleString()}</span></div>
                  </div>
                </div>
              </div>
            </a></div>
        </div>
      </div>`;
    } else {
      return `<div class="tw-transition tw-transition--enter-done tw-transition__scale-over tw-transition__scale-over--enter-done"
        style="transition: transform 250ms ease 0ms, opacity;">
        <div>
          <div class="side-nav-card tw-relative" data-test-selector="side-nav-card"><a
              class="tbs-group-item side-nav-card__link tw-align-items-center tw-flex tw-flex-nowrap tw-full-width tw-link tw-link--hover-underline-none tw-pd-x-1 tw-pd-y-05"
              data-test-selector="followed-channel" href="/${channel_info.user.login}">
              <div
                class="side-nav-card__avatar side-nav-card__avatar--offline tw-align-items-center tw-flex-shrink-0">
                <figure aria-label="${channel_info.user.displayName} (${channel_info.user.login})" class="tw-avatar tw-avatar--size-30"><img
                    class="tw-block tw-border-radius-rounded tw-image tw-image-avatar"
                    alt="${channel_info.user.displayName} (${channel_info.user.login})"
                    src="${channel_info.user.profileImageURL}"
                    title="" style=""></figure>
              </div>
              <div class="tw-ellipsis tw-flex tw-full-width tw-justify-content-between">
                <div data-a-target="side-nav-card-metadata" class="tw-ellipsis tw-full-width tw-mg-l-1">
                  <div class="side-nav-card__title tw-align-items-center tw-flex">
                    <p data-a-target="side-nav-title"
                      class="tw-c-text-alt tw-ellipsis tw-ellipsis tw-flex-grow-1 tw-font-size-5 tw-line-height-heading tw-semibold"
                      title="${channel_info.user.displayName} (${channel_info.user.login})"><span>${channel_info.user.displayName} <span
                          class="intl-login">(${channel_info.user.login})</span></span></p>
                  </div>
                  <div class="side-nav-card__metadata tw-pd-r-05" data-a-target="side-nav-game-title">
                    <p class="tw-c-text-alt-2 tw-ellipsis tw-font-size-6 tw-line-height-heading"
                      title="새 동영상 ${channel_info.content.edges.length.toLocaleString()}개">새 동영상 ${channel_info.content.edges.length.toLocaleString()}개</p>
                  </div>
                </div>
                <div class="side-nav-card__live-status tw-flex-shrink-0 tw-mg-l-05"
                  data-a-target="side-nav-live-status"><span
                    class="tw-c-text-alt tw-font-size-6">오프라인</span></div>
              </div>
            </a></div>
        </div>
      </div>`;
    }
  }

  /**
   * Register global event listeners
   */
  function registerEventListeners() {
    document.addEventListener('click', function (e) {
      if (e.target) {
        let current_target = e.target;
        while (current_target !== null) {
          if (current_target.classList.contains('side-nav-card__link')) {
            if (current_target.classList.contains('tbs-group-header')) {
              const group_index = current_target.dataset.tbsGroupIndex;
              const group = groups[group_index];
              setGroupOpened(group['group_name'], !group['is_opened']);
              e.preventDefault();
              return;
            } else if (current_target.classList.contains('tbs-group-item')) {
              const href = current_target.getAttribute('href');
              reactHistory.push(href);
              e.preventDefault();
              return;
            }
          }
          current_target = current_target.parentElement;
        }
      }
    });
  }

  /**
   * Get the first React state node from element
   * @param {Element} el Target element 
   * @return {object} React state node
   */
  function getReactStateNode(el) {
    const key = Object.keys(el).find(key => key.startsWith("__reactInternalInstance$"));
    let reactObj = el[key];
    while (reactObj.stateNode === null || reactObj.stateNode.refs === undefined) {
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
    const key = Object.keys(el).find(key => key.startsWith("__reactInternalInstance$"));
    let reactObj = el[key];
    while (reactObj.stateNode === null || reactObj.stateNode.props === undefined || reactObj.stateNode.props.history === undefined) {
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
      const followingEl = document.querySelector('.side-nav-section:first-child');
      const followingSn = getReactStateNode(followingEl);
      const followingOriginalComponentDidUpdate = followingSn.componentDidUpdate;
      followingSn.componentDidUpdate = function (prevProps, prevState, snapshot) {
        console.log("[TBS] FOLLOWING REACT UPDATED");
        if (followingOriginalComponentDidUpdate !== undefined) {
          followingOriginalComponentDidUpdate.call(this, prevProps, prevState, snapshot);
        }
        requestFollowedSectionData();
      }
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
      semiRootSn.componentDidUpdate = function (prevProps, prevState, snapshot) {
        console.log("[TBS] ROOT UPDATED");
        if (semiRootOriginalComponentDidUpdate !== undefined) {
          semiRootOriginalComponentDidUpdate.call(this, prevProps, prevState, snapshot);
        }
        // It should be call once, so restore original function here
        semiRootSn.componentDidUpdate = semiRootOriginalComponentDidUpdate;
        requestFollowedSectionData();
        checkFollowingUiUpdated();
      }
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
  
  window.addEventListener('load', function () {
    checkRootUiUpdated();
  }, false);
})();