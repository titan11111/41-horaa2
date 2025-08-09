// ========= 3Dホラーゲーム「家の見取り図」 =========
(() => {
  
  // ========= ゲームの状態を管理する変数 =========
  const gameState = {
    chapter: 1,           // 現在の章
    steps: 0,             // 歩いた回数
    desync: 0,            // 図面との不一致度
    currentRoom: '玄関',   // 今いる部屋
    visitedRooms: new Set(['玄関']),
    inventory: ['古い見取り図'],
    clock: 23 * 60 + 40,  // 時刻
    gameEnded: false,
    playerPosition: { x: 0, y: 0, z: 0 },  // プレイヤーの3D位置
    playerRotation: { x: 0, y: 0 }         // プレイヤーの向き
  };

  // ========= Three.js関連の変数 =========
  let scene, camera, renderer, controls;
  let rooms3D = {};
  let currentInteractable = null;
  let keys = {};

  // ========= 部屋のデータ =========
  const roomsData = {
    '玄関': { 
      position3D: { x: 0, y: 0, z: 0 },
      exits: { 東: '廊下' }, 
      description: '湿った靴の匂い。傘立てには折れた骨のような傘。壁のフックに見取り図が掛かっている。',
      color: 0x2a3f54
    },
    '廊下': { 
      position3D: { x: 10, y: 0, z: 0 },
      exits: { 西: '玄関', 東: '居間', 南: '階段' }, 
      description: '細い廊下。壁紙がところどころ浮いている。天井から低い音。',
      color: 0x1a2f3f
    },
    '居間': { 
      position3D: { x: 20, y: 0, z: 0 },
      exits: { 西: '廊下', 南: '台所' }, 
      description: '薄暗い居間。テレビは砂嵐。テーブルにコップの輪染み。',
      color: 0x3f2a1a
    },
    '台所': { 
      position3D: { x: 20, y: 0, z: 10 },
      exits: { 北: '居間', 西: '物置' }, 
      description: '流しに水が残っている。冷蔵庫が間欠的に唸る。',
      color: 0x2f3f2a
    },
    '物置': { 
      position3D: { x: 10, y: 0, z: 10 },
      exits: { 東: '台所' }, 
      description: '段ボールが積まれている。見取り図の予備が散乱。',
      color: 0x3f3f2a
    },
    '階段': { 
      position3D: { x: 10, y: 0, z: 15 },
      exits: { 北: '廊下', 上: '二階廊下' }, 
      description: '踏むたびに鳴る。二段目だけ音がしない。',
      color: 0x4a3a2a
    },
    '二階廊下': { 
      position3D: { x: 10, y: 5, z: 15 },
      exits: { 下: '階段', 東: '寝室', 西: '子ども部屋' }, 
      description: '二階の廊下は異様に長い。窓の外は月明かり。',
      color: 0x2a2a4a
    },
    '寝室': { 
      position3D: { x: 20, y: 5, z: 15 },
      exits: { 西: '二階廊下' }, 
      description: 'ベッドが一つ。掛け布団は人の形で膨らんでいる。',
      color: 0x4a2a3a
    },
    '子ども部屋': { 
      position3D: { x: 0, y: 5, z: 15 },
      exits: { 東: '二階廊下' }, 
      description: '壁に落書き。背の高い影と、赤い四角。',
      color: 0x3a2a4a
    }
  };

  // ========= HTML要素を取得 =========
  const elements = {
    loading: document.getElementById('loading'),
    gameWrap: document.getElementById('gameWrap'),
    game3d: document.getElementById('game3d'),
    roomTitle: document.getElementById('roomTitle'),
    roomDescription: document.getElementById('roomDescription'),
    blueprint: document.getElementById('blueprint'),
    chapter: document.getElementById('chapter'),
    desync: document.getElementById('desync'),
    inventory: document.getElementById('inventory'),
    clock: document.getElementById('clock'),
    toast: document.getElementById('toast'),
    interaction: document.getElementById('interaction'),
    interactionText: document.getElementById('interactionText')
  };

  // ========= 便利な関数 =========
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  const showMessage = (message) => {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => elements.toast.classList.remove('show'), 2000);
  };

  const showInteraction = (text) => {
    elements.interactionText.textContent = text;
    elements.interaction.classList.add('visible');
  };

  const hideInteraction = () => {
    elements.interaction.classList.remove('visible');
  };

  // ========= 3D世界の初期化 =========
  function init3D() {
    // シーンの作成
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x000000, 10, 50);
    
    // カメラの作成
    camera = new THREE.PerspectiveCamera(75, elements.game3d.clientWidth / elements.game3d.clientHeight, 0.1, 100);
    
    // レンダラーの作成
    renderer = new THREE.WebGLRenderer({ canvas: elements.game3d, antialias: true });
    renderer.setSize(elements.game3d.clientWidth, elements.game3d.clientHeight);
    renderer.setClearColor(0x000000);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // ライトの追加
    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    scene.add(ambientLight);
    
    const flashlight = new THREE.SpotLight(0xffffff, 1, 20, Math.PI / 6, 0.5);
    flashlight.position.set(0, 0, 0);
    flashlight.castShadow = true;
    camera.add(flashlight);
    scene.add(camera);
    
    // 部屋の作成
    create3DRooms();
    
    // プレイヤーを玄関に配置
    movePlayerToRoom('玄関');
  }

  // ========= 3D部屋の作成 =========
  function create3DRooms() {
    Object.entries(roomsData).forEach(([roomName, roomData]) => {
      const roomGroup = new THREE.Group();
      
      // 床
      const floorGeometry = new THREE.PlaneGeometry(8, 8);
      const floorMaterial = new THREE.MeshLambertMaterial({ 
        color: roomData.color,
        transparent: true,
        opacity: 0.8
      });
      const floor = new THREE.Mesh(floorGeometry, floorMaterial);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      roomGroup.add(floor);
      
      // 壁（4面）
      const wallHeight = 3;
      const wallGeometry = new THREE.PlaneGeometry(8, wallHeight);
      const wallMaterial = new THREE.MeshLambertMaterial({ 
        color: roomData.color,
        transparent: true,
        opacity: 0.6
      });
      
      // 北の壁
      const northWall = new THREE.Mesh(wallGeometry, wallMaterial);
      northWall.position.set(0, wallHeight / 2, -4);
      roomGroup.add(northWall);
      
      // 南の壁
      const southWall = new THREE.Mesh(wallGeometry, wallMaterial);
      southWall.position.set(0, wallHeight / 2, 4);
      southWall.rotation.y = Math.PI;
      roomGroup.add(southWall);
      
      // 東の壁
      const eastWall = new THREE.Mesh(wallGeometry, wallMaterial);
      eastWall.position.set(4, wallHeight / 2, 0);
      eastWall.rotation.y = -Math.PI / 2;
      roomGroup.add(eastWall);
      
      // 西の壁
      const westWall = new THREE.Mesh(wallGeometry, wallMaterial);
      westWall.position.set(-4, wallHeight / 2, 0);
      westWall.rotation.y = Math.PI / 2;
      roomGroup.add(westWall);
      
      // インタラクトオブジェクト（部屋の中心に配置）
      const interactGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      const interactMaterial = new THREE.MeshLambertMaterial({ 
        color: 0xff4444,
        emissive: 0x220000
      });
      const interactObject = new THREE.Mesh(interactGeometry, interactMaterial);
      interactObject.position.set(0, 0.25, 0);
      interactObject.userData = { type: 'interact', room: roomName };
      roomGroup.add(interactObject);
      
      // 部屋グループを配置
      roomGroup.position.copy(roomData.position3D);
      scene.add(roomGroup);
      
      rooms3D[roomName] = {
        group: roomGroup,
        interactObject: interactObject
      };
    });
  }

  // ========= プレイヤー移動 =========
  function movePlayerToRoom(roomName) {
    const roomData = roomsData[roomName];
    if (!roomData) return;
    
    gameState.currentRoom = roomName;
    gameState.visitedRooms.add(roomName);
    
    // 3D位置を設定
    camera.position.copy(roomData.position3D);
    camera.position.y += 1.6; // 目の高さ
    
    updateUI();
    updateBlueprint();
  }

  // ========= キーボード制御 =========
  function setupControls() {
    document.addEventListener('keydown', (e) => {
      keys[e.code] = true;
      
      if (e.code === 'KeyE' && currentInteractable) {
        interactWithObject(currentInteractable);
      }
    });
    
    document.addEventListener('keyup', (e) => {
      keys[e.code] = false;
    });
    
    // マウス制御
    let isMouseDown = false;
    let mouseX = 0, mouseY = 0;
    
    elements.game3d.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      elements.game3d.requestPointerLock();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === elements.game3d) {
        mouseX += e.movementX * 0.002;
        mouseY += e.movementY * 0.002;
        
        mouseY = Math.max(-Math.PI/2, Math.min(Math.PI/2, mouseY));
        
        camera.rotation.set(mouseY, mouseX, 0);
      }
    });
    
    elements.game3d.addEventListener('click', () => {
      if (currentInteractable) {
        interactWithObject(currentInteractable);
      }
    });
  }

  // ========= プレイヤー移動処理 =========
  function updateMovement() {
    const moveSpeed = 0.1;
    const direction = new THREE.Vector3();
    
    if (keys['KeyW']) direction.z -= moveSpeed;
    if (keys['KeyS']) direction.z += moveSpeed;
    if (keys['KeyA']) direction.x -= moveSpeed;
    if (keys['KeyD']) direction.x += moveSpeed;
    
    if (direction.length() > 0) {
      direction.applyQuaternion(camera.quaternion);
      direction.y = 0; // Y軸移動を制限
      camera.position.add(direction);
      
      // 部屋の境界チェック
      checkRoomTransition();
    }
  }

  // ========= 部屋遷移チェック =========
  function checkRoomTransition() {
    const currentRoomData = roomsData[gameState.currentRoom];
    if (!currentRoomData) return;
    
    const playerPos = camera.position;
    const roomPos = currentRoomData.position3D;
    
    // 部屋の境界から出た場合の距離チェック
    const distance = Math.sqrt(
      Math.pow(playerPos.x - roomPos.x, 2) + 
      Math.pow(playerPos.z - roomPos.z, 2)
    );
    
    if (distance > 5) {
      // 最も近い部屋を探す
      let nearestRoom = null;
      let nearestDistance = Infinity;
      
      Object.entries(roomsData).forEach(([roomName, roomData]) => {
        if (roomName === gameState.currentRoom) return;
        
        const roomDistance = Math.sqrt(
          Math.pow(playerPos.x - roomData.position3D.x, 2) + 
          Math.pow(playerPos.z - roomData.position3D.z, 2)
        );
        
        if (roomDistance < nearestDistance && roomDistance < 6) {
          nearestDistance = roomDistance;
          nearestRoom = roomName;
        }
      });
      
      if (nearestRoom) {
        gameState.currentRoom = nearestRoom;
        gameState.steps++;
        gameState.visitedRooms.add(nearestRoom);
        advanceTime(3);
        updateUI();
        updateBlueprint();
        
        // 章の進行チェック
        checkChapterProgress();
      }
    }
  }

  // ========= インタラクト可能オブジェクトの検出 =========
  function checkInteractables() {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    const interactables = [];
    Object.values(rooms3D).forEach(room => {
      if (room.interactObject) {
        interactables.push(room.interactObject);
      }
    });
    
    const intersects = raycaster.intersectObjects(interactables);
    
    if (intersects.length > 0 && intersects[0].distance < 3) {
      if (currentInteractable !== intersects[0].object) {
        currentInteractable = intersects[0].object;
        const roomName = currentInteractable.userData.room;
        showInteraction(`Eキーで${roomName}を調べる`);
      }
    } else {
      if (currentInteractable) {
        currentInteractable = null;
        hideInteraction();
      }
    }
  }

  // ========= オブジェクトとのインタラクト =========
  function interactWithObject(object) {
    const roomName = object.userData.room;
    
    if (roomName === gameState.currentRoom) {
      // 同じ部屋のオブジェクトを調べる
      performRoomAction(roomName);
    } else {
      // 違う部屋に移動
      movePlayerToRoom(roomName);
      showMessage(`${roomName}に移動しました`);
    }
  }

  // ========= 部屋での特殊行動 =========
  function performRoomAction(roomName) {
    switch (gameState.chapter) {
      case 1:
        if (roomName === '玄関') {
          showMessage('図面が少し重くなった');
          increaseDesync(5);
        }
        break;
        
      case 2:
        if (roomName === '居間') {
          showMessage('赤い部屋への通路が出現した');
          addRedRoom();
          changeChapter(2);
        }
        break;
        
      case 3:
        if (roomName === '物置') {
          showMessage('出入り口の位置が変わった');
          reorganizeRooms();
          changeChapter(3);
        }
        break;
    }
    
    // エンディングトリガー
    if (gameState.chapter <= 3 && gameState.steps > 12) {
      showMessage('図面の中心から音がする...');
      setTimeout(() => {
        changeChapter(4);
        endGame();
      }, 2000);
    }
  }

  // ========= 赤い部屋の追加 =========
  function addRedRoom() {
    if (roomsData['赤い部屋']) return;
    
    roomsData['赤い部屋'] = {
      position3D: { x: 30, y: 0, z: 0 },
      exits: { 西: '居間' },
      description: '紙にしか存在しないはずの赤い部屋。床は図面用の方眼。',
      color: 0x8b0000
    };
    
    // 3D空間に赤い部屋を作成
    const roomGroup = new THREE.Group();
    
    // 床
    const floorGeometry = new THREE.PlaneGeometry(8, 8);
    const floorMaterial = new THREE.MeshLambertMaterial({ 
      color: 0x8b0000,
      transparent: true,
      opacity: 0.9
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    roomGroup.add(floor);
    
    // 赤い光を追加
    const redLight = new THREE.PointLight(0xff0000, 1, 10);
    redLight.position.set(0, 2, 0);
    roomGroup.add(redLight);
    
    // インタラクトオブジェクト
    const interactGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const interactMaterial = new THREE.MeshLambertMaterial({ 
      color: 0xff0000,
      emissive: 0x440000
    });
    const interactObject = new THREE.Mesh(interactGeometry, interactMaterial);
    interactObject.position.set(0, 0.25, 0);
    interactObject.userData = { type: 'interact', room: '赤い部屋' };
    roomGroup.add(interactObject);
    
    roomGroup.position.copy(roomsData['赤い部屋'].position3D);
    scene.add(roomGroup);
    
    rooms3D['赤い部屋'] = {
      group: roomGroup,
      interactObject: interactObject
    };
  }

  // ========= 部屋の再編成（迷路化） =========
  function reorganizeRooms() {
    // 一部の部屋の位置を変更
    const newPositions = {
      '廊下': { x: 15, y: 0, z: 5 },
      '階段': { x: 5, y: 0, z: 20 },
      '物置': { x: 25, y: 0, z: 15 }
    };
    
    Object.entries(newPositions).forEach(([roomName, newPos]) => {
      if (roomsData[roomName] && rooms3D[roomName]) {
        roomsData[roomName].position3D = newPos;
        rooms3D[roomName].group.position.copy(newPos);
      }
    });
    
    showMessage('家の構造が変わった...');
  }

  // ========= 章の進行管理 =========
  function changeChapter(chapterNumber) {
    if (gameState.chapter >= chapterNumber) return;
    
    gameState.chapter = chapterNumber;
    increaseDesync(15);
    updateUI();
  }

  function checkChapterProgress() {
    if (gameState.chapter === 1 && gameState.steps >= 3) {
      changeChapter(2);
    }
    if (gameState.chapter === 2 && gameState.steps >= 7) {
      changeChapter(3);
    }
  }

  // ========= 不一致度の増加 =========
  function increaseDesync(amount) {
    gameState.desync = Math.min(100, gameState.desync + amount);
    updateUI();
    
    // 不一致演出
    if (gameState.desync > 50) {
      scene.fog.far = 30; // 霧を濃くする
    }
    if (gameState.desync > 75) {
      scene.fog.far = 20;
    }
  }

  // ========= 時計の更新 =========
  function advanceTime(minutes = 1) {
    gameState.clock = (gameState.clock + minutes) % (24 * 60);
    const hours = String(Math.floor(gameState.clock / 60)).padStart(2, '0');
    const mins = String(gameState.clock % 60).padStart(2, '0');
    elements.clock.textContent = `${hours}:${mins}`;
  }

  // ========= UI更新 =========
  function updateUI() {
    elements.roomTitle.textContent = gameState.currentRoom;
    elements.roomDescription.textContent = roomsData[gameState.currentRoom]?.description || '';
    elements.chapter.textContent = gameState.chapter;
    elements.desync.textContent = gameState.desync + '%';
    elements.inventory.textContent = gameState.inventory.join('、');
  }

  // ========= 見取り図の更新 =========
  function updateBlueprint() {
    const canvas = elements.blueprint.getContext('2d');
    const width = elements.blueprint.width;
    const height = elements.blueprint.height;
    
    canvas.clearRect(0, 0, width, height);
    
    // 背景
    canvas.fillStyle = '#0b0f14';
    canvas.fillRect(0, 0, width, height);
    
    // 方眼
    canvas.strokeStyle = '#16202b';
    canvas.lineWidth = 1;
    
    for (let x = 0; x <= 10; x++) {
      canvas.beginPath();
      canvas.moveTo(40 + x * 40, 20);
      canvas.lineTo(40 + x * 40, height - 20);
      canvas.stroke();
    }
    
    for (let y = 0; y <= 8; y++) {
      canvas.beginPath();
      canvas.moveTo(40, 20 + y * 40);
      canvas.lineTo(width - 40, 20 + y * 40);
      canvas.stroke();
    }
    
    // 部屋の描画
    if (gameState.chapter < 4) {
      Object.entries(roomsData).forEach(([roomName, roomData]) => {
        if (!gameState.visitedRooms.has(roomName)) return;
        
        // 簡易的な2D位置計算
        const x = 40 + (roomData.position3D.x / 5) * 40;
        const y = 20 + (roomData.position3D.z / 5) * 40;
        const size = 36;
        
        // 部屋の色
        let roomColor = '#14202b';
        if (roomName === '赤い部屋') roomColor = '#5b1a16';
        if (roomName === gameState.currentRoom) roomColor = '#1e2f22';
        
        // 不一致演出
        if (Math.random() < gameState.desync / 200) {
          roomColor = '#243447';
        }
        
        canvas.fillStyle = roomColor;
        canvas.strokeStyle = '#33414f';
        canvas.lineWidth = 1.5;
        canvas.beginPath();
        canvas.rect(x, y, size, size);
        canvas.fill();
        canvas.stroke();
        
        // 部屋名
        canvas.fillStyle = '#9fb0c1';
        canvas.font = '10px ui-sans-serif';
        
        let displayName = roomName;
        if (gameState.chapter >= 3 && Math.random() < 0.2) {
          const fakeNames = ['6/12', '10/03', '母の部屋', 'A-12', 'メ', '影', '003'];
          displayName = fakeNames[Math.floor(Math.random() * fakeNames.length)];
        }
        
        canvas.fillText(displayName, x + 4, y + 12);
      });
    } else {
      // 終章：真っ黒
      canvas.fillStyle = '#050709';
      canvas.fillRect(0, 0, width, height);
      
      canvas.fillStyle = '#c0d6ff';
      canvas.font = '12px ui-sans-serif';
      canvas.fillText('叩く音がする', 24, 28);
    }
  }

  // ========= ゲーム終了 =========
  async function endGame() {
    gameState.gameEnded = true;
    
    // 画面を暗くする
    scene.fog.color.setHex(0x000000);
    scene.fog.far = 5;
    
    await wait(1000);
    showMessage('視界が固定されました');
    
    await wait(2000);
    
    // カメラを固定
    controls = null;
    
    showMessage('図面の中に閉じ込められた...');
    
    updateBlueprint();
  }

  // ========= メインループ =========
  function animate() {
    if (gameState.gameEnded) return;
    
    requestAnimationFrame(animate);
    
    updateMovement();
    checkInteractables();
    
    renderer.render(scene, camera);
  }

  // ========= リサイズ対応 =========
  function onWindowResize() {
    camera.aspect = elements.game3d.clientWidth / elements.game3d.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(elements.game3d.clientWidth, elements.game3d.clientHeight);
  }

  // ========= 初期化 =========
  async function initialize() {
    // ローディング表示
    await wait(3000);
    
    elements.loading.classList.add('hidden');
    elements.gameWrap.style.display = 'grid';
    
    // 3D初期化
    init3D();
    setupControls();
    
    // UI初期化
    updateUI();
    updateBlueprint();
    advanceTime(0);
    
    // リサイズイベント
    window.addEventListener('resize', onWindowResize);
    
    // メインループ開始
    animate();
    
    showMessage('WASDキーで移動、マウスで視点変更、Eキーで調べる');
  }

  // ゲーム開始
  initialize();
  
})();