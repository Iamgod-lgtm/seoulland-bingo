let missions = [];
let currentTeam = null;
let activeMissionId = null;
let currentMediaData = null;
let currentMediaType = 'image'; // 'image' | 'video'

// DOM 요소
const registrationSection = document.getElementById('registrationSection');
const regTeamSelect = document.getElementById('regTeamSelect');
const regMembersInput = document.getElementById('regMembersInput');
const btnStartGame = document.getElementById('btnStartGame');

const teamLockedCard = document.getElementById('teamLockedCard');
const lockedTeamName = document.getElementById('lockedTeamName');
const lockedTeamMembers = document.getElementById('lockedTeamMembers');
const btnResetTeamLocal = document.getElementById('btnResetTeamLocal');

const mainBingoSection = document.getElementById('mainBingoSection');
const bingoGrid = document.getElementById('bingoGrid');
const completedCountEl = document.getElementById('completedCount');
const bingoCountEl = document.getElementById('bingoCount');
const toastEl = document.getElementById('toast');

// 모달 요소
const missionModal = document.getElementById('missionModal');
const modalTitle = document.getElementById('modalMissionTitle');
const modalDesc = document.getElementById('modalMissionDesc');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const photoInput = document.getElementById('photoInput');
const videoInput = document.getElementById('videoInput');
const uploadDropArea = document.getElementById('uploadDropArea');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const previewImg = document.getElementById('previewImg');
const previewVideo = document.getElementById('previewVideo');
const btnSelectPhoto = document.getElementById('btnSelectPhoto');
const btnSelectVideo = document.getElementById('btnSelectVideo');
const btnSubmitMedia = document.getElementById('btnSubmitMedia');
const btnDeleteMedia = document.getElementById('btnDeleteMedia');

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// 1. 앱 초기화
async function initApp() {
  try {
    const resM = await fetch('/api/missions');
    const dataM = await resM.json();
    missions = dataM.missions || [];

    const isLocked = localStorage.getItem('my_team_locked') === 'true';
    const savedTeamId = localStorage.getItem('my_team_id');

    if (isLocked && savedTeamId) {
      showLockedState(savedTeamId);
      await loadTeamData(savedTeamId);
    } else {
      showRegistrationState();
    }
  } catch (err) {
    console.error('초기 로드 에러:', err);
    showToast('데이터를 불러오지 못했습니다. 새로고침 해주세요.');
  }
}

function showRegistrationState() {
  registrationSection.style.display = 'block';
  teamLockedCard.style.display = 'none';
  mainBingoSection.style.display = 'none';
}

function showLockedState(teamId) {
  registrationSection.style.display = 'none';
  teamLockedCard.style.display = 'block';
  mainBingoSection.style.display = 'block';

  const teamNum = teamId.replace('team', '');
  lockedTeamName.textContent = `${teamNum}팀`;

  const savedMembers = localStorage.getItem('my_team_members') || '등록된 팀원 없음';
  lockedTeamMembers.textContent = savedMembers;
}

// 2. 팀 등록
async function handleRegisterTeam() {
  const selectedTeamId = regTeamSelect.value;
  const membersText = regMembersInput.value.trim();

  if (!membersText) {
    alert('팀원 이름을 최소 1명 이상 입력해주세요!\n(예: 김철수, 이영희, 박민수)');
    regMembersInput.focus();
    return;
  }

  const teamNum = selectedTeamId.replace('team', '');
  const confirmMsg = `[${teamNum}팀] 으로 시작하시겠습니까?\n\n- 팀원: ${membersText}\n\n⚠️ 등록 후에는 다른 조로 변경할 수 없습니다!`;
  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch('/api/team_members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: selectedTeamId,
        members: membersText
      })
    });
    const data = await res.json();

    if (data.success) {
      localStorage.setItem('my_team_id', selectedTeamId);
      localStorage.setItem('my_team_members', membersText);
      localStorage.setItem('my_team_locked', 'true');

      currentTeam = data.team;
      showLockedState(selectedTeamId);
      renderBingoBoard();
      showToast(`🎉 [${teamNum}팀] 등록 완료! 미션을 시작하세요!`);
    } else {
      alert('팀 등록에 실패했습니다: ' + (data.message || '오류'));
    }
  } catch (err) {
    console.error('팀 등록 실패:', err);
    alert('서버 통신 오류');
  }
}

// 3. 팀 데이터 로드
async function loadTeamData(teamId) {
  try {
    const res = await fetch(`/api/team?id=${teamId}`);
    const data = await res.json();
    if (data.success) {
      currentTeam = data.team;
      if (currentTeam.members) {
        lockedTeamMembers.textContent = currentTeam.members;
        localStorage.setItem('my_team_members', currentTeam.members);
      }
      renderBingoBoard();
    }
  } catch (err) {
    console.error('팀 데이터 로드 실패:', err);
  }
}

// 4. 3x3 빙고판 렌더링 (사진/동영상 구분 지원)
function renderBingoBoard() {
  if (!currentTeam) return;

  const completed = currentTeam.completed || {};
  const completedLines = currentTeam.completedLines || [];
  
  const lineCellSet = new Set();
  completedLines.forEach(line => line.forEach(id => lineCellSet.add(id)));

  completedCountEl.textContent = currentTeam.completedCount || 0;
  bingoCountEl.textContent = currentTeam.bingoCount || 0;

  bingoGrid.innerHTML = '';

  missions.forEach((m, idx) => {
    const cellId = m.id || (idx + 1);
    const mediaItem = completed[cellId];
    const isDone = mediaItem && (mediaItem.photoUrl || mediaItem.mediaUrl);
    const isLine = lineCellSet.has(cellId);

    const cell = document.createElement('div');
    cell.className = `bingo-cell ${isDone ? 'completed' : ''} ${isLine ? 'highlight-line' : ''}`;
    cell.onclick = () => openMissionModal(m);

    if (isDone) {
      const url = mediaItem.mediaUrl || mediaItem.photoUrl;
      const isVideo = mediaItem.mediaType === 'video' || url.match(/\.(mp4|webm|mov)$/i);

      let mediaBgHtml = '';
      if (isVideo) {
        mediaBgHtml = `
          <video class="cell-photo-bg" src="${url}" muted loop autoplay playsinline></video>
          <div style="position: absolute; top: 6px; right: 6px; background: rgba(219, 39, 119, 0.85); color: white; border-radius: 6px; padding: 1px 5px; font-size: 10px; font-weight: 700; z-index: 3;">🎬 영상</div>
        `;
      } else {
        mediaBgHtml = `<img class="cell-photo-bg" src="${url}" alt="인증샷">`;
      }

      cell.innerHTML = `
        <span class="cell-number">${cellId}</span>
        ${mediaBgHtml}
        <div class="cell-content-overlay">
          <div class="check-mark">✓</div>
          <div class="cell-title">${m.title}</div>
        </div>
      `;
    } else {
      cell.innerHTML = `
        <span class="cell-number">${cellId}</span>
        <div class="cell-icon">📸</div>
        <div class="cell-title">${m.title}</div>
        <div class="cell-status-text">터치하여 인증</div>
      `;
    }

    bingoGrid.appendChild(cell);
  });
}

// 5. 모달 열기
function openMissionModal(mission) {
  activeMissionId = mission.id;
  currentMediaData = null;

  modalTitle.textContent = `${mission.id}번: ${mission.title}`;
  modalDesc.textContent = mission.description || '미션을 수행하고 인증 사진이나 동영상을 등록하세요.';

  const completed = (currentTeam.completed || {})[mission.id];

  if (completed && (completed.photoUrl || completed.mediaUrl)) {
    const url = completed.mediaUrl || completed.photoUrl;
    const isVideo = completed.mediaType === 'video' || url.match(/\.(mp4|webm|mov)$/i);

    uploadPlaceholder.style.display = 'none';
    if (isVideo) {
      previewImg.style.display = 'none';
      previewVideo.src = url;
      previewVideo.style.display = 'block';
    } else {
      previewVideo.style.display = 'none';
      previewImg.src = url;
      previewImg.style.display = 'block';
    }
    btnSubmitMedia.style.display = 'none';
    btnDeleteMedia.style.display = 'block';
  } else {
    previewImg.style.display = 'none';
    previewVideo.style.display = 'none';
    previewVideo.pause();
    previewVideo.src = '';
    uploadPlaceholder.style.display = 'flex';
    btnSubmitMedia.style.display = 'none';
    btnDeleteMedia.style.display = 'none';
  }

  missionModal.classList.add('active');
}

function closeMissionModal() {
  missionModal.classList.remove('active');
  photoInput.value = '';
  videoInput.value = '';
  previewVideo.pause();
  previewVideo.src = '';
  currentMediaData = null;
}

// 6. 이미지 압축 처리
function compressAndLoadImage(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const maxDim = 1080;
      let width = img.width;
      let height = img.height;

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      currentMediaData = compressedDataUrl;
      currentMediaType = 'image';

      previewVideo.style.display = 'none';
      previewVideo.pause();
      previewImg.src = compressedDataUrl;
      previewImg.style.display = 'block';
      uploadPlaceholder.style.display = 'none';

      btnSubmitMedia.style.display = 'block';
      btnSubmitMedia.textContent = '✨ 이 사진으로 인증 완료하기';
      btnSubmitMedia.disabled = false;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// 7. 동영상 파일 로드 (최대 35MB 제한)
function loadVideoFile(file) {
  if (!file) return;

  const maxSizeBytes = 35 * 1024 * 1024; // 35MB
  if (file.size > maxSizeBytes) {
    alert('동영상 용량이 너무 큽니다 (최대 35MB).\n현장 빠른 전송을 위해 10~15초 이내의 짧은 영상을 선택해주세요!');
    return;
  }

  showToast('⏳ 동영상 불러오는 중...');
  const reader = new FileReader();
  reader.onload = function(e) {
    currentMediaData = e.target.result;
    currentMediaType = 'video';

    previewImg.style.display = 'none';
    previewVideo.src = e.target.result;
    previewVideo.style.display = 'block';
    uploadPlaceholder.style.display = 'none';
    previewVideo.play().catch(() => {});

    btnSubmitMedia.style.display = 'block';
    btnSubmitMedia.textContent = '✨ 이 동영상으로 인증 완료하기';
    btnSubmitMedia.disabled = false;
  };
  reader.readAsDataURL(file);
}

// 8. 미디어 서버 전송
async function submitMedia() {
  if (!currentMediaData || !activeMissionId || !currentTeam) return;

  btnSubmitMedia.disabled = true;
  btnSubmitMedia.textContent = currentMediaType === 'video' ? '⏳ 동영상 업로드 중 (잠시 대기)...' : '⏳ 업로드 중...';

  try {
    const prevBingoCount = currentTeam.bingoCount || 0;

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: currentTeam.id,
        missionId: activeMissionId,
        mediaBase64: currentMediaData,
        mediaType: currentMediaType
      })
    });

    const data = await res.json();
    if (data.success) {
      currentTeam = data.team;
      renderBingoBoard();
      closeMissionModal();

      if (data.bingoCount > prevBingoCount) {
        showToast(`🎉 축하합니다! ${data.bingoCount}줄 빙고를 달성했습니다!`);
      } else {
        showToast(currentMediaType === 'video' ? '🎬 미션 동영상이 등록되었습니다!' : '✅ 미션 인증 사진이 등록되었습니다!');
      }
    } else {
      showToast('업로드에 실패했습니다: ' + (data.message || '오류'));
      btnSubmitMedia.disabled = false;
    }
  } catch (err) {
    console.error('업로드 에러:', err);
    showToast('서버 업로드 실패. 파일 용량을 확인해주세요.');
    btnSubmitMedia.disabled = false;
  }
}

// 9. 미디어 삭제
async function deleteMedia() {
  if (!activeMissionId || !currentTeam) return;
  if (!confirm('등록된 인증 미디어를 삭제하시겠습니까?')) return;

  try {
    const res = await fetch('/api/delete_photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: currentTeam.id,
        missionId: activeMissionId
      })
    });

    const data = await res.json();
    if (data.success) {
      currentTeam = data.team;
      renderBingoBoard();
      closeMissionModal();
      showToast('인증 파일이 삭제되었습니다.');
    }
  } catch (err) {
    showToast('삭제 실패: 서버 오류');
  }
}

// 선생님용 팀 재설정
btnResetTeamLocal.addEventListener('click', () => {
  const pwd = prompt('선생님 확인 비밀번호를 입력해주세요.\n(기본 비밀번호: 1234)');
  if (pwd === '1234') {
    if (confirm('팀 고정을 해제하고 다시 팀을 선택하시겠습니까?')) {
      localStorage.removeItem('my_team_locked');
      localStorage.removeItem('my_team_id');
      localStorage.removeItem('my_team_members');
      showRegistrationState();
      showToast('팀 선택이 초기화되었습니다.');
    }
  } else if (pwd !== null) {
    alert('비밀번호가 일치하지 않습니다.');
  }
});

// 이벤트 바인딩
btnStartGame.addEventListener('click', handleRegisterTeam);
modalCloseBtn.addEventListener('click', closeMissionModal);
missionModal.addEventListener('click', (e) => {
  if (e.target === missionModal) closeMissionModal();
});

btnSelectPhoto.addEventListener('click', () => photoInput.click());
btnSelectVideo.addEventListener('click', () => videoInput.click());

photoInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    compressAndLoadImage(e.target.files[0]);
  }
});

videoInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    loadVideoFile(e.target.files[0]);
  }
});

btnSubmitMedia.addEventListener('click', submitMedia);
btnDeleteMedia.addEventListener('click', deleteMedia);

window.addEventListener('DOMContentLoaded', initApp);
