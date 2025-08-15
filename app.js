const apiKey = "AIzaSyDI2vTti8GNhb-W4z3MotLKGbinpRFU3qU";
const channelUploadsId = "UCXq2nALoSbxLMehAvYTxt_A";

const shows = [
  { id: "UU9CuvdOVfMPvKCiwdGKL3cQ", title: "Game Grumps" },
  { id: "PLPQSL8Iv1BRryWY9HOpDXsT5QhjbqgFIl", title: "Steam Train" },
  { id: "PLjXSjjpvIcpzCA8bqM45q-1IK_RDsTuJF", title: "Grumpcade" },
  { id: null, title: "The Grumps", channel: channelUploadsId },
  { id: "PLRQGRBgN_EnrsxaVTQJKIao6lDAJyYOw-", title: "Game Grumps Vs" },
  { id: "PLRQGRBgN_Enq32ulNww6QJxdSp0cygD6m", title: "Guest Grumps" },
  { id: "PLRQGRBgN_EnqqwNutiWwAj8tZhMFIJ1rx", title: "Jingle Grumps" },
  { id: "PLRQGRBgN_EnpND5AJknSiwwP9OKMYx4RP", title: "Ghoul Grumps" },
  { id: "PLRQGRBgN_Enoeu_3aRq4OsBRRMHQbJPRc", title: "Game Show Grumps" },
  { id: "PLC4E9F4F6136EF251", title: "Game Grumps Animated" },
];

const showSelect = document.getElementById("showFilter");
const eraSelect = document.getElementById("eraFilter");
const spinner = document.getElementById("spinner");
const notice = document.getElementById("notice");
const playerContainer = document.getElementById("playerContainer");
const favoritesContainer = document.getElementById("favoritesContainer");

let db;
const DB_NAME = "gameGrumpsDB";
const STORE_VIDEOS = "videos";
const STORE_FAVORITES = "favorites";
const STORE_FAVORITE_POSITIONS = "favoritePositions";

// Populate show dropdown
shows.forEach((show) => {
  const opt = document.createElement("option");
  opt.value = show.id || show.channel;
  opt.textContent = show.title;
  showSelect.appendChild(opt);
});

// Default to Game Grumps
showSelect.value = "UU9CuvdOVfMPvKCiwdGKL3cQ";

// Default to no era filter (show all videos)
eraSelect.value = "";

// IndexedDB setup
const request = indexedDB.open(DB_NAME, 2);
request.onupgradeneeded = (e) => {
  db = e.target.result;
  if (!db.objectStoreNames.contains(STORE_VIDEOS))
    db.createObjectStore(STORE_VIDEOS, { keyPath: "title" });
  if (!db.objectStoreNames.contains(STORE_FAVORITES))
    db.createObjectStore(STORE_FAVORITES, { keyPath: "videoId" });
  if (!db.objectStoreNames.contains(STORE_FAVORITE_POSITIONS))
    db.createObjectStore(STORE_FAVORITE_POSITIONS, { keyPath: "videoId" });
};

request.onsuccess = async (e) => {
  db = e.target.result;

  // Initialize with retry logic
  await initializeApp();
};

async function initializeApp() {
  try {
    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      await new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", resolve);
      });
    }

    // Additional small delay to ensure all elements are ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    await loadFavorites();
    fetchAllShows(); // fetch everything on load
  } catch (error) {
    console.error("Error initializing app:", error);
    // Retry after a delay
    setTimeout(initializeApp, 500);
  }
}
request.onerror = (e) => console.error("IndexedDB error", e);

// ---------- FAVORITES ----------
let favorites = [];

async function saveFavorite(video) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FAVORITES, "readwrite");
    tx.objectStore(STORE_FAVORITES).put(video);
    tx.oncomplete = () => {
      loadFavorites().then(resolve).catch(reject);
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function removeFavorite(videoId) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FAVORITES, "readwrite");
    tx.objectStore(STORE_FAVORITES).delete(videoId);

    // Also remove position data (with error handling)
    try {
      const txPos = db.transaction(STORE_FAVORITE_POSITIONS, "readwrite");
      txPos.objectStore(STORE_FAVORITE_POSITIONS).delete(videoId);
    } catch (error) {
      console.warn("Position store not available yet:", error);
    }

    tx.oncomplete = () => {
      loadFavorites().then(resolve).catch(reject);
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function saveFavoritePosition(videoId, x, y) {
  try {
    const tx = db.transaction(STORE_FAVORITE_POSITIONS, "readwrite");
    tx.objectStore(STORE_FAVORITE_POSITIONS).put({ videoId, x, y });
  } catch (error) {
    console.warn("Position store not available yet:", error);
  }
}

async function getFavoritePositions() {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_FAVORITE_POSITIONS, "readonly");
      const req = tx.objectStore(STORE_FAVORITE_POSITIONS).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => {
        console.warn("Position store not available yet");
        resolve([]);
      };
    } catch (error) {
      console.warn("Position store not available yet:", error);
      resolve([]);
    }
  });
}

function getAllFavorites() {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_FAVORITES, "readonly");
      const req = tx.objectStore(STORE_FAVORITES).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => {
        console.error("Error getting favorites from database");
        resolve([]);
      };
    } catch (error) {
      console.error("Error in getAllFavorites:", error);
      resolve([]);
    }
  });
}

async function loadFavorites() {
  try {
    favorites = await getAllFavorites();
    await renderFavorites();
  } catch (error) {
    console.error("Error loading favorites:", error);
  }
}

async function renderFavorites() {
  try {
    const draggableArea = document.getElementById("draggableArea");
    if (!draggableArea) {
      console.error("Draggable area not found");
      return;
    }

    draggableArea.innerHTML = "";

    // Small delay to ensure the area is properly loaded
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Load cached positions
    const positions = await getFavoritePositions();
    const positionMap = {};
    positions.forEach((pos) => {
      positionMap[pos.videoId] = { x: pos.x, y: pos.y };
    });

    favorites.forEach((video, index) => {
      const div = document.createElement("div");
      div.className = "favVideo";
      div.dataset.videoId = video.videoId;

      // Use cached position or default grid position
      if (positionMap[video.videoId]) {
        div.style.left = `${positionMap[video.videoId].x}px`;
        div.style.top = `${positionMap[video.videoId].y}px`;
      } else {
        // Always position new favorites in the top left
        div.style.left = `20px`;
        div.style.top = `20px`;
      }

      div.innerHTML = `
        <img src="${video.thumbnail}" alt="${video.title}" draggable="false" />
        <button class="remove-fav-btn">&times;</button>
      `;

      // Remove button
      div.querySelector(".remove-fav-btn").onclick = async (e) => {
        e.stopPropagation();
        await removeFavorite(video.videoId);
      };

      // Drag and drop functionality with click handling
      makeDraggable(div, video);

      draggableArea.appendChild(div);
    });
  } catch (error) {
    console.error("Error rendering favorites:", error);
  }
}

// ---------- DRAG AND DROP FUNCTIONALITY ----------
function makeDraggable(element, video) {
  let isDragging = false;
  let startX, startY, initialX, initialY;
  let clickTimeout;
  let hasMoved = false;

  // Mouse events for desktop
  element.addEventListener("mousedown", startDrag);
  document.addEventListener("mousemove", drag);
  document.addEventListener("mouseup", endDrag);

  // Touch events for mobile
  element.addEventListener("touchstart", startDragTouch, { passive: false });
  document.addEventListener("touchmove", dragTouch, { passive: false });
  document.addEventListener("touchend", endDragTouch);

  // Click to play video
  element.querySelector("img").onclick = (e) => {
    if (!hasMoved) {
      // Convert favorite object to the format expected by showVideo
      const videoForPlayback = {
        snippet: {
          resourceId: { videoId: video.videoId },
          title: video.title,
          thumbnails: { default: { url: video.thumbnail } },
        },
      };
      showVideo(videoForPlayback);
    }
  };

  function startDrag(e) {
    e.preventDefault();
    hasMoved = false;

    // Small delay to distinguish between click and drag
    clickTimeout = setTimeout(() => {
      isDragging = true;
      element.classList.add("dragging");
    }, 150);

    const rect = element.getBoundingClientRect();
    const containerRect = document
      .getElementById("draggableArea")
      .getBoundingClientRect();

    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    initialX = rect.left - containerRect.left;
    initialY = rect.top - containerRect.top;
  }

  function startDragTouch(e) {
    e.preventDefault();
    hasMoved = false;

    // Small delay to distinguish between tap and drag
    clickTimeout = setTimeout(() => {
      isDragging = true;
      element.classList.add("dragging");
    }, 150);

    const rect = element.getBoundingClientRect();
    const containerRect = document
      .getElementById("draggableArea")
      .getBoundingClientRect();
    const touch = e.touches[0];

    startX = touch.clientX - rect.left;
    startY = touch.clientY - rect.top;
    initialX = rect.left - containerRect.left;
    initialY = rect.top - containerRect.top;
  }

  function drag(e) {
    if (!isDragging) return;
    e.preventDefault();
    hasMoved = true;
    clearTimeout(clickTimeout);

    const containerRect = document
      .getElementById("draggableArea")
      .getBoundingClientRect();
    const newX = e.clientX - containerRect.left - startX;
    const newY = e.clientY - containerRect.top - startY;

    // Constrain to container bounds
    const maxX = containerRect.width - element.offsetWidth;
    const maxY = containerRect.height - element.offsetHeight;

    element.style.left = Math.max(0, Math.min(newX, maxX)) + "px";
    element.style.top = Math.max(0, Math.min(newY, maxY)) + "px";
  }

  function dragTouch(e) {
    if (!isDragging) return;
    e.preventDefault();
    hasMoved = true;
    clearTimeout(clickTimeout);

    const containerRect = document
      .getElementById("draggableArea")
      .getBoundingClientRect();
    const touch = e.touches[0];
    const newX = touch.clientX - containerRect.left - startX;
    const newY = touch.clientY - containerRect.top - startY;

    // Constrain to container bounds
    const maxX = containerRect.width - element.offsetWidth;
    const maxY = containerRect.height - element.offsetHeight;

    element.style.left = Math.max(0, Math.min(newX, maxX)) + "px";
    element.style.top = Math.max(0, Math.min(newY, maxY)) + "px";
  }

  function endDrag() {
    clearTimeout(clickTimeout);
    if (isDragging) {
      isDragging = false;
      element.classList.remove("dragging");

      // Save the new position
      const x = parseInt(element.style.left);
      const y = parseInt(element.style.top);
      saveFavoritePosition(video.videoId, x, y);
    }
  }

  function endDragTouch(e) {
    clearTimeout(clickTimeout);
    if (isDragging) {
      isDragging = false;
      element.classList.remove("dragging");

      // Save the new position
      const x = parseInt(element.style.left);
      const y = parseInt(element.style.top);
      saveFavoritePosition(video.videoId, x, y);
    }
  }
}

// ---------- VIDEO FETCH ----------
const cache = {};

async function fetchVideosFromAPI(show) {
  let videos = [];
  let nextPageToken = "";
  let firstLoad = true;

  notice.textContent = `Loading "${show.title}" videos…`;
  notice.style.display = "block";

  do {
    let url;
    if (show.id) {
      url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${show.id}&key=${apiKey}&pageToken=${nextPageToken}`;
    } else {
      url = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}&channelId=${show.channel}&part=snippet&order=date&maxResults=50&type=video&pageToken=${nextPageToken}`;
    }

    const res = await fetch(url);
    const data = await res.json();
    if (data.error) {
      console.warn(data.error.message);
      notice.textContent = `Error fetching videos: ${data.error.message}`;
      break;
    }

    videos = videos.concat(
      data.items.map((item) => ({
        snippet: {
          resourceId: show.id
            ? item.snippet.resourceId
            : { videoId: item.id.videoId },
          title: item.snippet.title,
          thumbnails: item.snippet.thumbnails,
          publishedAt: item.snippet.publishedAt,
        },
      }))
    );

    nextPageToken = data.nextPageToken || "";

    if (!firstLoad && nextPageToken) {
      notice.textContent = `Fetching more "${show.title}" videos…`;
    }
    firstLoad = false;
  } while (nextPageToken);

  // Store in IndexedDB
  const tx = db.transaction(STORE_VIDEOS, "readwrite");
  tx.objectStore(STORE_VIDEOS).put({ title: show.title, videos });

  cache[show.title] = videos;

  return videos;
}

// ---------- FETCH ALL SHOWS ON LOAD ----------
async function fetchAllShows() {
  spinner.style.display = "block";
  notice.textContent = "Loading all videos… please wait.";
  notice.style.display = "block";

  for (const show of shows) {
    // Check IndexedDB first
    const tx = db.transaction(STORE_VIDEOS, "readonly");
    const stored = await new Promise((resolve) => {
      const req = tx.objectStore(STORE_VIDEOS).get(show.title);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });

    // Check if stored data has publishedAt field
    const hasPublishedAt =
      stored?.videos?.length > 0 && stored.videos[0]?.snippet?.publishedAt;

    if (stored?.videos?.length && hasPublishedAt) {
      cache[show.title] = stored.videos;
      continue;
    }

    // Fetch from API if not cached or missing publishedAt
    await fetchVideosFromAPI(show);
  }

  spinner.style.display = "none";
  notice.textContent = "All videos loaded!";
  setTimeout(() => (notice.style.display = "none"), 2000);
}

// ---------- GET VIDEOS FROM CACHE ----------
async function fetchVideos(show) {
  return cache[show.title] || [];
}

// ---------- ERA FILTERING ----------
function filterVideosByEra(videos, era) {
  if (!era) return videos;

  const jonEraEndDate = new Date("2013-06-25T00:00:00Z");

  return videos.filter((video) => {
    // Handle cases where publishedAt might not exist in cached data
    if (!video.snippet.publishedAt) {
      console.warn("Video missing publishedAt field:", video.snippet.title);
      return true; // Include videos without date info
    }

    const publishedAt = new Date(video.snippet.publishedAt);

    if (era === "jon") {
      return publishedAt < jonEraEndDate;
    } else if (era === "dan") {
      return publishedAt >= jonEraEndDate;
    }

    return true;
  });
}

// ---------- VIDEO DISPLAY ----------
function showVideo(video) {
  const videoId = video.snippet.resourceId.videoId;
  const title = video.snippet.title || "Video";
  const thumbnail = video.snippet.thumbnails?.default?.url || "";

  function updateFavButton() {
    const favBtn = document.getElementById("favBtn");
    const inFav = favorites.some((f) => f.videoId === videoId);
    favBtn.textContent = inFav ? "Remove from Favorites" : "Add to Favorites";
  }

  async function toggleFavorite() {
    const inFav = favorites.some((f) => f.videoId === videoId);
    const favVideo = { videoId, title, thumbnail };

    if (inFav) {
      await removeFavorite(videoId);
    } else {
      await saveFavorite(favVideo);
    }

    // Update button state after the async operation completes
    updateFavButton();
  }

  playerContainer.innerHTML = `
    <iframe src="https://www.youtube.com/embed/${videoId}" allowfullscreen></iframe>
    <div id="videoTitle">${title}</div>
    <button id="favBtn">Add to Favorites</button>
  `;

  updateFavButton();
  document.getElementById("favBtn").onclick = async () =>
    await toggleFavorite();
}

// ---------- RANDOM PICKER ----------
document.getElementById("pickRandom").addEventListener("click", async () => {
  const selectedValue = showSelect.value || "UU9CuvdOVfMPvKCiwdGKL3cQ";
  const selectedShow = shows.find(
    (s) => s.id === selectedValue || s.channel === selectedValue
  );
  const selectedEra = eraSelect.value;

  const videos = await fetchVideos(selectedShow);
  if (!videos.length) {
    notice.textContent = "No videos found.";
    return;
  }

  // Apply era filter
  const filteredVideos = filterVideosByEra(videos, selectedEra);

  if (!filteredVideos.length) {
    const eraText = selectedEra
      ? ` in ${selectedEra === "jon" ? "Jon" : "Dan"} Era`
      : "";
    notice.textContent = `No videos found for ${selectedShow.title}${eraText}.`;
    return;
  }

  const randomVideo =
    filteredVideos[Math.floor(Math.random() * filteredVideos.length)];
  showVideo(randomVideo);

  // Show filter status
  const eraText = selectedEra
    ? ` (${selectedEra === "jon" ? "Jon" : "Dan"} Era)`
    : "";
  notice.textContent = `Showing: ${selectedShow.title}${eraText} - ${filteredVideos.length} videos available`;
  setTimeout(() => (notice.style.display = "none"), 3000);
});
