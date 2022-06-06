# Twitch Follower Organizer

> "We need better sidebar."
> \- wonzy_world, 2021

Twitch Follower Organizer는 트위치 웹 사이트 사이드바에서 '팔로우 중인 채널'을 그룹 기반으로 정리하여 표시해주는
유저스크립트입니다.

### ⚠️ 주의사항 ⚠️

Twitch Follower Organizer는 Twitch에서 관리하는 서비스가 아닙니다.

Twitch Follower Organizer는 Twitch에서 공식적으로 허용하지 않는 API 등을 사용하여 구현하였으며, Twitch
Follower Organizer를 사용함에 따라 발생하는 모든 문제(예시: 버그, 계정 밴, 민사소송)에 대해 저희는 책임을
지지 않습니다.

당신은 Twitch Follower Organizer를 설치 또는 사용했을 경우 이러한 주의사항을 확인하고 동의한 것입니다.

## 설치 및 사용 방법

1. 자주 사용하시는 브라우저에 [Tampermonkey](https://www.tampermonkey.net/)를 설치합니다.

2. [스크립트 설치 링크](https://raw.githubusercontent.com/rishubil/twitch-follower-organizer/master/twitch-follower-organizer.user.js)를
   클릭하고 Tampermonkey에 스크립트를 설치합니다.

   - 또는 Tampermonkey 도구 페이지에서 'Install from URL' 입력란에
     `https://raw.githubusercontent.com/rishubil/twitch-follower-organizer/master/twitch-follower-organizer.user.js`를
     직접 입력하고 설치 버튼을 클릭하여 설치할 수도 있습니다.

3. Twitch 웹 사이트에 접속하여 변경된 사이드바를 확인하세요.
   - 그룹 추가 버튼을 눌러 신규 그룹을 추가할 수 있습니다.
   - 그룹 내의 스트리머를 드래그하여 다른 그룹으로 옮길 수 있습니다.
   - 그룹 우측 수정 버튼을 클릭하여 그룹 이름, 색상 등의 옵션을 변경할 수 있습니다.
   - 그룹을 드래그하여 그룹의 표시 순서를 변경할 수 있습니다.

## 설정 백업 및 복원

1. Tampermonkey 설정 페이지에서 `일반 > 설정 모드` 값을 `상급자`로 변경합니다.
2. Tampermonkey 설치된 유저 스크립트 페이지에서 `Twitch Follower Organizer` 항목을 클릭합니다.
3. 상단 탭에서 `Storage` 를 선택한 후, 텍스트 박스 내의 내용을 복사하여 설정을 백업할 수 있습니다.
4. 백업된 설정을 복원하려면 텍스트 박스에 복원하고자 하는 설정 값을 붙여넣고 `저장` 버튼을 클릭합니다.

## 라이선스

Twitch Follower Organizer는 [Business Source License 1.1](/LICENSE) 하에 제공됩니다.

Twitch Follower Organizer는 다음과 같은 라이브러리를 사용하였습니다.

- [Lodash](https://lodash.com/) (MIT License)
- [Tabler Icons](https://tablericons.com/) (MIT License)
