let missions = [];
let teams = [];
let pollingTimer = null;

const teamsGrid = document.getElementById('teamsGrid');
const toastEl = document.getElementById('toast');

// 사진 뷰어 모달
const photoViewerModal = document.getElementById('photoViewerModal');
const viewerTitle = document.getElementById('viewerTitle');
const viewerSubtitle = document.getElementById('viewerSubtitle');
const viewerLargeImg = document.getElementById('viewerLargeImg');
const viewerCloseBtn = document.getElementById('viewerCloseBtn');

// 미션 편집 모달
const missionsModal = document.getElementById('missionsModal');
const btnEditMissions = document.getElementById('btnEditMissions');
const missionsCloseBtn = document.getElementById('missionsCloseBtn');
const btnCancelMissions = document.getElementById('btnCancelMissions');
const btnSaveMissions = document.getElementById('btnSaveMissions');
const missionInputsContainer = document.getElementById('missionInputsContainer');
const btnResetAll = document.getElementById('btnResetAll');

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2500);
}

// 1. 초기 로드
async function initAdmin() {
  await loadMissions();
  await loadTeams();

  // 3초마다 자동 실시간 동기화
  pollingTimer = setInterval(loadTeams, 3000);
}

// 2. 미션 목록 로드
async function loadMissions() {
  try {
    const res = await fetch('/api/missions');
    const data = await res.json();
    missions = data.missions || [];
  } catch (err) {
    console.error('미션 로드 실패:', err);
  }
}

// 3. 팀 목록 로드
async function loadTeams() {
  try {
    const res = await fetch('/api/teams');
    const data = await res.json();
    if (data.success) {
      teams = data.teams || [];
      renderTeams();
    }
  } catch (err) {
    console.error('팀 데이터 로드 실패:', err);
  }
}

// 4. 팀 카드 렌더링 (빙고 수 많은 순 정렬)
function renderTeams() {
  // 정렬: 빙고 수 내림차순 -> 완료 개수 내림차순 -> 최근 업데이트 순
  const sortedTeams = [...teams].sort((a, b) => {
    if (b.bingoCount !== a.bingoCount) return b.bingoCount - a.bingoCount;
    if (b.completedCount !== a.completedCount) return b.completedCount - a.completedCount;
    return (b.lastUpdated || 0) - (a.lastUpdated || 0);
  });

  teamsGrid.innerHTML = '';

  sortedTeams.forEach((t, idx) => {
    const card = document.createElement('div');
    card.className = 'team-card';

    let rankClass = '';
    if (idx === 0 && (t.bingoCount > 0 || t.completedCount > 0)) rankClass = 'rank-1';

    const completed = t.completed || {};

    let miniCellsHtml = '';
    for (let i = 1; i <= 9; i++) {
      const cellData = completed[i];
      const missionInfo = missions.find(m => m.id === i) || { title: `미션 ${i}` };

      if (cellData && (cellData.photoUrl || cellData.mediaUrl)) {
        const url = cellData.mediaUrl || cellData.photoUrl;
        const isVideo = cellData.mediaType === 'video' || url.match(/\.(mp4|webm|mov)$/i);
        const mediaTag = isVideo 
          ? `<video src="${url}" muted style="width: 100%; height: 100%; object-fit: cover;"></video><div class="mini-check" style="background: rgba(219,39,119,0.9); font-size: 8px;">🎬</div>`
          : `<img src="${url}" alt="인증샷"><div class="mini-check">✓</div>`;

        miniCellsHtml += `
          <div class="mini-cell done" onclick="openPhotoViewer('${t.name}', '${missionInfo.title}', '${url}', ${cellData.timestamp}, '${isVideo ? 'video' : 'image'}')">
            ${mediaTag}
          </div>
        `;
      } else {
        miniCellsHtml += `
          <div class="mini-cell" title="${missionInfo.title}">
            ${i}
          </div>
        `;
      }
    }

    const membersText = t.members ? `👥 ${t.members}` : '<span style="color: #94a3b8;">미등록</span>';

    card.innerHTML = `
      <div class="team-card-header">
        <div class="team-card-name">
          <span class="rank-badge ${rankClass}">${idx + 1}위</span>
          <span>${t.name}</span>
        </div>
        <div style="font-size: 13px; color: #64748b;">
          ${t.lastUpdated ? new Date(t.lastUpdated).toLocaleTimeString() : '대기 중'}
        </div>
      </div>
      <div style="font-size: 13px; color: #475569; margin-bottom: 10px; background: #f8fafc; padding: 6px 10px; border-radius: 8px; border: 1px solid #f1f5f9;">
        <strong>팀원:</strong> ${membersText}
      </div>
      <div class="team-stats">
        <div>🎉 빙고: <strong style="color: #4f46e5; font-size: 16px;">${t.bingoCount || 0}</strong> 줄</div>
        <div>📸 미션 완료: <strong>${t.completedCount || 0}</strong> / 9</div>
      </div>
      <div class="team-mini-grid">
        ${miniCellsHtml}
      </div>
    `;

    teamsGrid.appendChild(card);
  });
}

// 5. 미디어(사진/동영상) 확대 뷰어 모달 열기
const viewerVideo = document.getElementById('viewerVideo');

window.openPhotoViewer = function(teamName, missionTitle, mediaUrl, timestamp, mediaType) {
  viewerTitle.textContent = `[${teamName}] ${missionTitle}`;
  viewerSubtitle.textContent = timestamp ? `제출 시간: ${new Date(timestamp).toLocaleString()}` : '';

  if (mediaType === 'video' || mediaUrl.match(/\.(mp4|webm|mov)$/i)) {
    viewerLargeImg.style.display = 'none';
    viewerVideo.src = mediaUrl;
    viewerVideo.style.display = 'block';
    viewerVideo.play().catch(() => {});
  } else {
    viewerVideo.pause();
    viewerVideo.src = '';
    viewerVideo.style.display = 'none';
    viewerLargeImg.src = mediaUrl;
    viewerLargeImg.style.display = 'block';
  }

  photoViewerModal.classList.add('active');
};

function closePhotoViewer() {
  photoViewerModal.classList.remove('active');
  if (viewerVideo) {
    viewerVideo.pause();
    viewerVideo.src = '';
  }
}

viewerCloseBtn.addEventListener('click', closePhotoViewer);
photoViewerModal.addEventListener('click', (e) => {
  if (e.target === photoViewerModal) closePhotoViewer();
});


// 6. 미션 편집 모달
btnEditMissions.addEventListener('click', () => {
  missionInputsContainer.innerHTML = '';
  for (let i = 1; i <= 9; i++) {
    const m = missions.find(item => item.id === i) || { title: `미션 ${i}`, description: '' };
    const row = document.createElement('div');
    row.style.background = '#f8fafc';
    row.style.padding = '12px';
    row.style.borderRadius = '10px';
    row.style.border = '1px solid #e2e8f0';

    row.innerHTML = `
      <div style="font-weight: 700; font-size: 13px; color: #4f46e5; margin-bottom: 6px;">
        미션 ${i}번
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <input type="text" id="mTitle_${i}" value="${m.title}" placeholder="미션 제목 (예: 지구별 무대 단체샷)" style="padding: 8px 12px; border-radius: 8px; border: 1px solid #cbd5e1; font-weight: 600;">
        <input type="text" id="mDesc_${i}" value="${m.description || ''}" placeholder="상세 설명 (예: 조원 전원이 나오도록 찍기)" style="padding: 8px 12px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 13px;">
      </div>
    `;
    missionInputsContainer.appendChild(row);
  }
  missionsModal.classList.add('active');
});

missionsCloseBtn.addEventListener('click', () => missionsModal.classList.remove('active'));
btnCancelMissions.addEventListener('click', () => missionsModal.classList.remove('active'));

btnSaveMissions.addEventListener('click', async () => {
  const newMissions = [];
  for (let i = 1; i <= 9; i++) {
    const titleInput = document.getElementById(`mTitle_${i}`);
    const descInput = document.getElementById(`mDesc_${i}`);
    newMissions.push({
      id: i,
      title: titleInput.value.trim() || `미션 ${i}`,
      description: descInput.value.trim() || '미션을 수행하고 인증 사진을 등록하세요.'
    });
  }

  try {
    const res = await fetch('/api/missions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ missions: newMissions })
    });
    const data = await res.json();
    if (data.success) {
      missions = data.missions;
      missionsModal.classList.remove('active');
      showToast('✅ 9개 미션이 성공적으로 저장되었습니다!');
      renderTeams();
    }
  } catch (err) {
    showToast('저장에 실패했습니다.');
  }
});

// 7. 전체 초기화
btnResetAll.addEventListener('click', async () => {
  if (!confirm('⚠️ 정말로 모든 팀의 인증 사진 및 빙고 점수를 초기화하시겠습니까?')) return;
  const clearMembers = confirm('👥 팀원 명단(이름)도 함께 초기화하시겠습니까?\n\n- [확인]: 팀원 명단 및 사진/빙고 전체 초기화\n- [취소]: 팀원 명단은 유지하고 사진/빙고만 초기화');

  try {
    const res = await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: 'all', clearMembers: clearMembers })
    });
    const data = await res.json();
    if (data.success) {
      teams = data.teams;
      renderTeams();
      showToast('🔄 모든 데이터가 성공적으로 초기화되었습니다.');
    }
  } catch (err) {
    showToast('초기화 실패');
  }
});


window.addEventListener('DOMContentLoaded', initAdmin);
