let missions = [];
let currentTeam = null;
let activeMissionId = null;
let currentImageData = null;

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
const cameraInput = document.getElementById('cameraInput');
const galleryInput = document.getElementById('galleryInput');
const uploadDropArea = document.getElementById('uploadDropArea');
const uploadPlaceholder = document.getElementById('uploadPlaceholder');
const previewImg = document.getElementById('previewImg');
const btnCamera = document.getElementById('btnCamera');
const btnGallery = document.getElementById('btnGallery');
const btnSubmitPhoto = document.getElementById('btnSubmitPhoto');
const btnDeletePhoto = document.getElementById('btnDeletePhoto');

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// 1. 앱 초기화 (팀 고정 여부 확인)
async function initApp() {
  try {
    // 9개 미션 정보 불러오기
    const resM = await fetch('/api/missions');
    const dataM = await resM.json();
    missions = dataM.missions || [];

    // 로컬 스토리지에 저장된 팀 고정 상태 확인
    const isLocked = localStorage.getItem('my_team_locked') === 'true';
    const savedTeamId = localStorage.getItem('my_team_id');

    if (isLocked && savedTeamId) {
      // 이미 고정된 조가 있는 경우 -> 바로 빙고판으로 직행!
      showLockedState(savedTeamId);
      await loadTeamData(savedTeamId);
    } else {
      // 아직 등록되지 않은 경우 -> 등록 화면 표시
      showRegistrationState();
    }
  } catch (err) {
    console.error('초기 로드 에러:', err);
    showToast('데이터를 불러오지 못했습니다. 새로고침 해주세요.');
  }
}

// 등록 화면 표시
function showRegistrationState() {
  registrationSection.style.display = 'block';
  teamLockedCard.style.display = 'none';
  mainBingoSection.style.display = 'none';
}

// 고정된 빙고판 화면 표시
function showLockedState(teamId) {
  registrationSection.style.display = 'none';
  teamLockedCard.style.display = 'block';
  mainBingoSection.style.display = 'block';

  // 팀 번호 표시
  const teamNum = teamId.replace('team', '');
  lockedTeamName.textContent = `${teamNum}팀`;

  const savedMembers = localStorage.getItem('my_team_members') || '등록된 팀원 없음';
  lockedTeamMembers.textContent = savedMembers;
}

// 2. 팀 및 팀원 등록 실행
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
    // 서버에 팀원 정보 저장
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
      // 로컬 스토리지에 영구 고정 저장 (재접속 시에도 유지)
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
    alert('서버와의 통신에 실패했습니다.');
  }
}

// 3. 팀 데이터 로드 및 UI 갱신
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

// 4. 3x3 빙고판 렌더링
function renderBingoBoard() {
  if (!currentTeam) return;

  const completed = currentTeam.completed || {};
  const completedLines = currentTeam.completedLines || [];
  
  // 빙고 완성 라인에 포함된 셀 번호 모음
  const lineCellSet = new Set();
  completedLines.forEach(line => line.forEach(id => lineCellSet.add(id)));

  completedCountEl.textContent = currentTeam.completedCount || 0;
  bingoCountEl.textContent = currentTeam.bingoCount || 0;

  bingoGrid.innerHTML = '';

  missions.forEach((m, idx) => {
    const cellId = m.id || (idx + 1);
    const isDone = completed[cellId] && completed[cellId].photoUrl;
    const isLine = lineCellSet.has(cellId);

    const cell = document.createElement('div');
    cell.className = `bingo-cell ${isDone ? 'completed' : ''} ${isLine ? 'highlight-line' : ''}`;
    cell.onclick = () => openMissionModal(m);

    if (isDone) {
      cell.innerHTML = `
        <span class="cell-number">${cellId}</span>
        <img class="cell-photo-bg" src="${completed[cellId].photoUrl}" alt="인증샷">
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
  currentImageData = null;

  modalTitle.textContent = `${mission.id}번: ${mission.title}`;
  modalDesc.textContent = mission.description || '미션을 수행하고 인증 사진을 등록하세요.';

  const completed = (currentTeam.completed || {})[mission.id];

  if (completed && completed.photoUrl) {
    // 이미 완료된 사진이 있을 때
    previewImg.src = completed.photoUrl;
    previewImg.style.display = 'block';
    uploadPlaceholder.style.display = 'none';
    btnSubmitPhoto.style.display = 'none';
    btnDeletePhoto.style.display = 'block';
  } else {
    // 아직 미인증일 때
    previewImg.style.display = 'none';
    uploadPlaceholder.style.display = 'flex';
    btnSubmitPhoto.style.display = 'none';
    btnDeletePhoto.style.display = 'none';
  }

  missionModal.classList.add('active');
}

function closeMissionModal() {
  missionModal.classList.remove('active');
  cameraInput.value = '';
  galleryInput.value = '';
  currentImageData = null;
}

// 6. 스마트폰 사진 압축 (Canvas 리사이징)
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

      // JPEG 압축 (품질 0.82)
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      currentImageData = compressedDataUrl;

      // 미리보기 반영
      previewImg.src = compressedDataUrl;
      previewImg.style.display = 'block';
      uploadPlaceholder.style.display = 'none';
      btnSubmitPhoto.style.display = 'block';
      btnSubmitPhoto.textContent = '✨ 이 사진으로 인증 완료하기';
      btnSubmitPhoto.disabled = false;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// 7. 사진 서버 전송
async function submitPhoto() {
  if (!currentImageData || !activeMissionId || !currentTeam) return;

  btnSubmitPhoto.disabled = true;
  btnSubmitPhoto.textContent = '⏳ 업로드 중...';

  try {
    const prevBingoCount = currentTeam.bingoCount || 0;

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: currentTeam.id,
        missionId: activeMissionId,
        imageBase64: currentImageData
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
        showToast('✅ 미션 인증 사진이 등록되었습니다!');
      }
    } else {
      showToast('업로드에 실패했습니다: ' + (data.message || '오류'));
      btnSubmitPhoto.disabled = false;
    }
  } catch (err) {
    console.error('업로드 요청 오류:', err);
    showToast('서버 연결에 실패했습니다.');
    btnSubmitPhoto.disabled = false;
  }
}

// 8. 사진 삭제
async function deletePhoto() {
  if (!activeMissionId || !currentTeam) return;
  if (!confirm('등록된 인증 사진을 삭제하시겠습니까?')) return;

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
      showToast('인증 사진이 삭제되었습니다.');
    }
  } catch (err) {
    showToast('삭제 실패: 서버 오류');
  }
}

// 9. 실수로 조를 잘못 선택했을 때 (선생님 확인용 재설정)
btnResetTeamLocal.addEventListener('click', () => {
  const pwd = prompt('선생님 확인 비밀번호를 입력해주세요.\n(기본 비밀번호: 1234)');
  if (pwd === '1234') {
    if (confirm('팀 고정을 해제하고 다시 팀을 선택하시겠습니까?')) {
      localStorage.removeItem('my_team_locked');
      localStorage.removeItem('my_team_id');
      localStorage.removeItem('my_team_members');
      showRegistrationState();
      showToast('팀 선택이 초기화되었습니다. 다시 등록해주세요.');
    }
  } else if (pwd !== null) {
    alert('비밀번호가 일치하지 않습니다.');
  }
});

// 이벤트 리스너 바인딩
btnStartGame.addEventListener('click', handleRegisterTeam);

modalCloseBtn.addEventListener('click', closeMissionModal);
missionModal.addEventListener('click', (e) => {
  if (e.target === missionModal) closeMissionModal();
});

btnCamera.addEventListener('click', () => cameraInput.click());
btnGallery.addEventListener('click', () => galleryInput.click());
uploadDropArea.addEventListener('click', (e) => {
  if (e.target === uploadDropArea || e.target.closest('.upload-placeholder')) {
    cameraInput.click();
  }
});

cameraInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    compressAndLoadImage(e.target.files[0]);
  }
});

galleryInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    compressAndLoadImage(e.target.files[0]);
  }
});

btnSubmitPhoto.addEventListener('click', submitPhoto);
btnDeletePhoto.addEventListener('click', deletePhoto);

// 앱 시작
window.addEventListener('DOMContentLoaded', initApp);
