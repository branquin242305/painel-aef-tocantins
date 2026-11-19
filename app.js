// ==========================================================================
// PAINEL DE CONSULTA AEF & MUNICÍPIOS - NATURATINS (INSTITUTO NATUREZA DO TOCANTINS)
// CORREÇÃO TOPOLÓGICA GEOESPACIAL COMPLETA
// ==========================================================================

let map;
let activeTileLayer = null;
let currentLayerId = "satellite";
let currentAEFsList = [...AEFS_DATA];
let mapMarkers = [];
let mapPolygons = [];
let limitesLayerGroup = null;
let selectedAEF = null;
let selectedMuniPolygon = null;
let arlLayerGroup = null;
let currentArlList = [];
let ibamaLayerGroup = null;

// Inicialização quando o DOM estiver pronto
document.addEventListener("DOMContentLoaded", () => {
  initMap();
  populateMunicipalityDropdowns();
  setupLayerSwitcher();
  setupTabSwitcher();
  updateKPIs(AEFS_DATA);
  renderResultsList(AEFS_DATA);
  renderMunicipalBoundariesLayer();
  renderMapFeatures(AEFS_DATA);
  renderIbamaFeatures();
  syncThemeToggles();

  // Fechar menu dropdown ao clicar fora
  document.addEventListener("click", (e) => {
    const menuContainer = document.querySelector(".menu-container");
    const dropdown = document.getElementById("main-menu-dropdown");
    if (dropdown && dropdown.classList.contains("show")) {
      if (menuContainer && !menuContainer.contains(e.target)) {
        dropdown.classList.remove("show");
      }
    }
  });
});

// --------------------------------------------------------------------------
// 1. INICIALIZAÇÃO DO MAPA LEAFLET (NATURATINS / TOCANTINS)
// --------------------------------------------------------------------------
function initMap() {
  const centerLat = (typeof ESTADO_INFO !== "undefined" && ESTADO_INFO.centroide) ? ESTADO_INFO.centroide[0] : -10.1844;
  const centerLng = (typeof ESTADO_INFO !== "undefined" && ESTADO_INFO.centroide) ? ESTADO_INFO.centroide[1] : -48.3336;
  const initialZoom = (typeof ESTADO_INFO !== "undefined" && ESTADO_INFO.zoom) ? ESTADO_INFO.zoom : 7;

  map = L.map("map-canvas", {
    preferCanvas: true,
    center: [centerLat, centerLng],
    zoom: initialZoom,
    zoomControl: false
  });

  // Criar panes dedicados para prioridade de camadas e eventos de ponteiro/mouse
  map.createPane('municipiosPane');
  map.getPane('municipiosPane').style.zIndex = 400;

  map.createPane('aefPane');
  map.getPane('aefPane').style.zIndex = 500;

  map.createPane('arlPane');
  map.getPane('arlPane').style.zIndex = 450;
  
  arlLayerGroup = L.featureGroup().addTo(map);

  map.createPane('ibamaPane');
  map.getPane('ibamaPane').style.zIndex = 480;
  
  ibamaLayerGroup = L.featureGroup().addTo(map);

  // Carregar camada de fundo inicial (Satélite)
  switchTileLayer("satellite");

  // Rastreamento de coordenadas no rodapé do mapa
  map.on("mousemove", (e) => {
    const coordsEl = document.getElementById("map-coords");
    if (coordsEl) {
      coordsEl.innerText = `Lat: ${e.latlng.lat.toFixed(4)}° | Lng: ${e.latlng.lng.toFixed(4)}° | SIRGAS 2000 / NATURATINS`;
    }
  });
}

window.currentPlanetMosaic = "global_monthly_2026_09_mosaic";

// Alternar entre os Mapas de Fundo
function switchTileLayer(layerId) {
  if (!MAP_LAYERS[layerId]) return;

  if (activeTileLayer) {
    map.removeLayer(activeTileLayer);
  }

  const layerConfig = MAP_LAYERS[layerId];

  if (layerConfig.isWms) {
    const mosaicName = window.currentPlanetMosaic || layerConfig.defaultLayer;
    activeTileLayer = L.tileLayer.wms(layerConfig.url, {
      layers: mosaicName,
      styles: '',
      format: 'image/jpeg',
      transparent: false,
      version: '1.3.0',
      crs: L.CRS.EPSG3857,
      maxZoom: layerConfig.maxZoom || 20,
      attribution: layerConfig.attribution
    }).addTo(map);
  } else {
    const tileOptions = {
      maxZoom: layerConfig.maxZoom || 20,
      attribution: layerConfig.attribution
    };
    if (layerConfig.subdomains) {
      tileOptions.subdomains = layerConfig.subdomains;
    }
    activeTileLayer = L.tileLayer(layerConfig.url, tileOptions).addTo(map);
  }

  currentLayerId = layerId;

  // Exibir seletor de meses se for Planet 2026
  const monthSelector = document.getElementById("planet-month-selector");
  if (monthSelector) {
    if (layerId === "planet2026") {
      monthSelector.style.display = "block";
    } else {
      monthSelector.style.display = "none";
    }
  }

  document.querySelectorAll(".map-option-card").forEach((card) => {
    if (card.dataset.layer === layerId) {
      card.classList.add("active");
    } else {
      card.classList.remove("active");
    }
  });
}

// Trocar o mês do mosaico Planet 2026 dinamicamente
window.changePlanetMonth = function (mosaicLayerName) {
  window.currentPlanetMosaic = mosaicLayerName;
  if (currentLayerId === "planet2026" && activeTileLayer) {
    activeTileLayer.setParams({
      layers: mosaicLayerName,
      styles: ''
    });
  }
};

function setupLayerSwitcher() {
  document.querySelectorAll(".map-option-card").forEach((card) => {
    card.addEventListener("click", () => {
      const layerId = card.dataset.layer;
      switchTileLayer(layerId);
    });
  });
}

// --------------------------------------------------------------------------
// 2. CAMADA DE LIMITES MUNICIPAIS DO TOCANTINS (TOPOLOGIA GEOESPACIAL PERFEITA)
// --------------------------------------------------------------------------
function renderMunicipalBoundariesLayer() {
  if (typeof LIMITES_MUNICIPAIS_DATA === "undefined") return;

  if (limitesLayerGroup) {
    map.removeLayer(limitesLayerGroup);
  }

  limitesLayerGroup = L.layerGroup();

  LIMITES_MUNICIPAIS_DATA.forEach((muni) => {
    const rawParts = muni.parts || [muni.polygon || muni.geometry];
    if (!rawParts || rawParts.length === 0) return;

    const muniGroup = L.featureGroup();
    const baseStyle = {
      pane: 'municipiosPane',
      color: "#ffd100", // Amarelo NATURATINS
      weight: 1.2,
      opacity: 0.85,
      dashArray: null,
      fill: false, // Sem preenchimento opaco para não interceptar eventos de mouse das AEFs
      interactive: false // Desativa eventos de mouse para permitir tooltip das AEFs
    };

    rawParts.forEach((partPts) => {
      if (!partPts || partPts.length === 0) return;
      const poly = L.polygon(partPts, baseStyle);
      muniGroup.addLayer(poly);
    });

    muniGroup.on("mouseover", () => {
      muniGroup.setStyle({
        weight: 2.5,
        color: "#ffffff"
      });
    });

    muniGroup.on("mouseout", () => {
      muniGroup.setStyle(baseStyle);
    });

    muniGroup.on("click", () => {
      document.getElementById("select-municipio").value = muni.nome;
      window.searchByMunicipality();
    });

    limitesLayerGroup.addLayer(muniGroup);
  });

  limitesLayerGroup.addTo(map);
}

// --------------------------------------------------------------------------
// ATIVADOR DE TEMAS GEOESPACIAIS (MENU DROPDOWN)
// --------------------------------------------------------------------------

// Clique interativo no item de tema (linha inteira ou switch)
window.handleThemeItemClick = function (event, checkboxId) {
  if (event.target.closest('.switch-toggle')) return;
  const cb = document.getElementById(checkboxId);
  if (cb) {
    cb.checked = !cb.checked;
    cb.dispatchEvent(new Event('change'));
  }
};

// Sincronizar estados visuais iniciais dos temas
function syncThemeToggles() {
  const aefCb = document.getElementById("toggle-aef");
  if (aefCb) window.toggleAefLayer(aefCb.checked);

  const arlCb = document.getElementById("toggle-arl");
  if (arlCb) window.toggleArlLayer(arlCb.checked);

  const muniCb = document.getElementById("toggle-limites-muni-menu");
  if (muniCb) window.toggleLimitesMunicipaisLayer(muniCb.checked);

  const ibamaCb = document.getElementById("toggle-ibama");
  if (ibamaCb) window.toggleIbamaLayer(ibamaCb.checked);
}

// 1. Limites Municipais (139 TO)
window.toggleLimitesMunicipaisLayer = function (show) {
  const itemEl = document.getElementById("item-theme-limites");
  const badgeEl = document.getElementById("status-badge-limites");
  const cb = document.getElementById("toggle-limites-muni-menu");
  if (cb && cb.checked !== show) cb.checked = show;

  if (itemEl) {
    if (show) itemEl.classList.add("theme-active");
    else itemEl.classList.remove("theme-active");
  }

  if (badgeEl) {
    badgeEl.innerText = show ? "● HABILITADO (VISÍVEL NO MAPA)" : "○ DESABILITADO (OCULTO)";
    badgeEl.className = "theme-status-badge " + (show ? "status-on" : "status-off");
  }

  if (!limitesLayerGroup) return;
  if (show) {
    map.addLayer(limitesLayerGroup);
  } else {
    map.removeLayer(limitesLayerGroup);
  }
};

// 2. Autorizações de Exploração Florestal (AEF)
window.isAefLayerVisible = true;
window.toggleAefLayer = function (show) {
  window.isAefLayerVisible = show;

  const itemEl = document.getElementById("item-theme-aef");
  const badgeEl = document.getElementById("status-badge-aef");
  const cb = document.getElementById("toggle-aef");
  if (cb && cb.checked !== show) cb.checked = show;

  if (itemEl) {
    if (show) itemEl.classList.add("theme-active");
    else itemEl.classList.remove("theme-active");
  }

  if (badgeEl) {
    badgeEl.innerText = show ? "● HABILITADO (VISÍVEL NO MAPA)" : "○ DESABILITADO (OCULTO)";
    badgeEl.className = "theme-status-badge " + (show ? "status-on" : "status-off");
  }

  if (show) {
    mapMarkers.forEach(m => map.addLayer(m));
    mapPolygons.forEach(p => map.addLayer(p));
  } else {
    mapMarkers.forEach(m => map.removeLayer(m));
    mapPolygons.forEach(p => map.removeLayer(p));
  }
};

// 3. Reserva Legal
window.isArlLayerVisible = true;
window.toggleArlLayer = function (show) {
  window.isArlLayerVisible = show;

  const itemEl = document.getElementById("item-theme-arl");
  const badgeEl = document.getElementById("status-badge-arl");
  const cb = document.getElementById("toggle-arl");
  if (cb && cb.checked !== show) cb.checked = show;

  if (itemEl) {
    if (show) itemEl.classList.add("theme-active");
    else itemEl.classList.remove("theme-active");
  }

  if (badgeEl) {
    badgeEl.innerText = show ? "● HABILITADO (VISÍVEL NO MAPA)" : "○ DESABILITADO (OCULTO)";
    badgeEl.className = "theme-status-badge " + (show ? "status-on" : "status-off");
  }

  if (typeof arlLayerGroup !== 'undefined' && arlLayerGroup) {
    if (show) {
      map.addLayer(arlLayerGroup);
    } else {
      map.removeLayer(arlLayerGroup);
    }
  }
};

// 4. Autorizações IBAMA / SINAFLOR
window.isIbamaLayerVisible = true;
window.toggleIbamaLayer = function (show) {
  window.isIbamaLayerVisible = show;

  const itemEl = document.getElementById("item-theme-ibama");
  const badgeEl = document.getElementById("status-badge-ibama");
  const cb = document.getElementById("toggle-ibama");
  if (cb && cb.checked !== show) cb.checked = show;

  if (itemEl) {
    if (show) itemEl.classList.add("theme-active");
    else itemEl.classList.remove("theme-active");
  }

  if (badgeEl) {
    badgeEl.innerText = show ? "● HABILITADO (VISÍVEL NO MAPA)" : "○ DESABILITADO (OCULTO)";
    badgeEl.className = "theme-status-badge " + (show ? "status-on" : "status-off");
  }

  if (typeof ibamaLayerGroup !== 'undefined' && ibamaLayerGroup) {
    if (show) {
      map.addLayer(ibamaLayerGroup);
    } else {
      map.removeLayer(ibamaLayerGroup);
    }
  }
};

// --------------------------------------------------------------------------
// 3. CONTROLE DAS ABAS DE CONSULTA E DROPDOWNS
// --------------------------------------------------------------------------
function setupTabSwitcher() {
  const tabs = document.querySelectorAll(".tab-btn");
  const contents = document.querySelectorAll(".query-panel-content");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      contents.forEach((c) => c.classList.remove("active"));

      tab.classList.add("active");
      const tabTarget = tab.dataset.tab;
      const activeContent = document.getElementById(tabTarget);
      if (activeContent) {
        activeContent.classList.add("active");
      }
    });
  });
}

function populateMunicipalityDropdowns() {
  const selectMuni = document.getElementById("select-municipio");
  const comboMuni = document.getElementById("combo-municipio");
  const arlMuni = document.getElementById("arl-municipio");

  selectMuni.innerHTML = '<option value="">-- Todos os 139 Municípios do Tocantins --</option>';
  comboMuni.innerHTML = '<option value="">-- Qualquer Município --</option>';
  if (arlMuni) arlMuni.innerHTML = '<option value="">-- Qualquer Município --</option>';

  const sourceData = (typeof LIMITES_MUNICIPAIS_DATA !== "undefined" && LIMITES_MUNICIPAIS_DATA.length > 0)
    ? LIMITES_MUNICIPAIS_DATA
    : MUNICIPOS_DATA;

  const sorted = [...sourceData].sort((a, b) => a.nome.localeCompare(b.nome));

  sorted.forEach((muni) => {
    const opt1 = document.createElement("option");
    opt1.value = muni.nome;
    opt1.textContent = `${muni.nome} (${muni.uf || 'TO'})`;
    selectMuni.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = muni.nome;
    opt2.textContent = `${muni.nome} (${muni.uf || 'TO'})`;
    comboMuni.appendChild(opt2);
    
    if (arlMuni) {
      const opt3 = document.createElement("option");
      opt3.value = muni.nome;
      opt3.textContent = `${muni.nome} (${muni.uf || 'TO'})`;
      arlMuni.appendChild(opt3);
    }
  });

  // Listener dinâmico para recalcular a consulta espacial imediatamente ao mudar a seleção
  selectMuni.addEventListener("change", () => window.searchByMunicipality());
  comboMuni.addEventListener("change", () => window.searchCombined());
  const comboStatus = document.getElementById("combo-status");
  if (comboStatus) {
    comboStatus.addEventListener("change", () => window.searchCombined());
  }

  const totalCountEl = document.getElementById("total-muni-count");
  if (totalCountEl) totalCountEl.innerText = sorted.length;
}

// --------------------------------------------------------------------------
// 4. MOTOR DE CONSULTA ESPACIAL (EQUIVALENTE A ST_Intersects)
// --------------------------------------------------------------------------

// Calcula Bounding Box rápido [minLat, maxLat, minLng, maxLng]
function getGeometryBBox(pts) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const lat = pts[i][0];
    const lng = pts[i][1];
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, maxLat, minLng, maxLng };
}

// Teste rápido de interseção de Bounding Boxes (AABB)
function doBBoxesIntersect(b1, b2) {
  return !(b1.maxLat < b2.minLat || b1.minLat > b2.maxLat || b1.maxLng < b2.minLng || b1.minLng > b2.maxLng);
}

// Ponto no Polígono (Algoritmo Ray Casting / Teorema da Curva de Jordan)
function isPointInRing(pt, ring) {
  const lat = pt[0];
  const lng = pt[1];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lng) !== (yj > lng)) &&
        (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Interseção entre dois segmentos de reta (Edge-Edge Cross)
function doSegmentsIntersect(p1, p2, p3, p4) {
  function ccw(A, B, C) {
    return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0]);
  }
  return (ccw(p1, p3, p4) !== ccw(p2, p3, p4)) && (ccw(p1, p2, p3) !== ccw(p1, p2, p4));
}

// Interseção entre dois anéis poligonais (arestas se cruzam)
function doRingsIntersect(ring1, ring2) {
  for (let i = 0; i < ring1.length - 1; i++) {
    for (let j = 0; j < ring2.length - 1; j++) {
      if (doSegmentsIntersect(ring1[i], ring1[i+1], ring2[j], ring2[j+1])) {
        return true;
      }
    }
  }
  return false;
}

// Função ST_Intersects espacial completa entre uma feição (AEF) e o limite municipal
function stIntersectsFeatureWithMunicipality(feature, muniData) {
  if (!feature || !muniData) return false;

  const rawMuniParts = muniData.parts || [muniData.polygon || muniData.geometry];
  if (!rawMuniParts || rawMuniParts.length === 0) return false;

  // Obter geometria da AEF
  const geomData = feature.geometry || feature.polygon;

  // Se não houver polígono, testa se o ponto/centroide está contido no município
  if (!geomData || geomData.length === 0) {
    if (feature.centroide) {
      for (let m = 0; m < rawMuniParts.length; m++) {
        const mRing = rawMuniParts[m];
        if (mRing && isPointInRing(feature.centroide, mRing)) {
          return true;
        }
      }
    }
    return false;
  }

  // Normalizar os anéis da AEF (suporta 2D e 3D arrays)
  const featRings = (Array.isArray(geomData[0]) && typeof geomData[0][0] === "number")
    ? [geomData]
    : geomData;

  for (let m = 0; m < rawMuniParts.length; m++) {
    const mRing = rawMuniParts[m];
    if (!mRing || mRing.length < 3) continue;
    const mBBox = getGeometryBBox(mRing);

    for (let f = 0; f < featRings.length; f++) {
      const fRing = featRings[f];
      if (!fRing || fRing.length < 3) continue;
      const fBBox = getGeometryBBox(fRing);

      // 1. Rejeição rápida por Bounding Box
      if (!doBBoxesIntersect(mBBox, fBBox)) {
        continue;
      }

      // 2. Centroide ou Primeiro Vértice da AEF contido no município
      if (feature.centroide && isPointInRing(feature.centroide, mRing)) return true;
      if (isPointInRing(fRing[0], mRing)) return true;

      // 3. Qualquer vértice da AEF dentro do limite municipal
      for (let v = 1; v < fRing.length; v++) {
        if (isPointInRing(fRing[v], mRing)) return true;
      }

      // 4. Qualquer vértice do município dentro da AEF (caso a AEF envolva o limite)
      if (isPointInRing(mRing[0], fRing)) return true;

      // 5. Interseção de arestas (a AEF atravessa / intersecta a divisa municipal)
      if (doRingsIntersect(fRing, mRing)) {
        return true;
      }
    }
  }

  return false;
}

// --------------------------------------------------------------------------
// 5. CONSULTAS ESPACIAIS E FILTROS DINÂMICOS
// --------------------------------------------------------------------------

// Consulta 1: Por Número da AEF / Processo CIGMA
window.searchByAEF = function () {
  const query = document.getElementById("input-aef-num").value.trim().toLowerCase();

  if (!query) {
    applyFilter(AEFS_DATA);
    return;
  }

  const filtered = AEFS_DATA.filter(
    (item) =>
      item.numero_aef.toLowerCase().includes(query) ||
      item.car.toLowerCase().includes(query) ||
      item.titular.toLowerCase().includes(query)
  );

  applyFilter(filtered);

  if (filtered.length === 1) {
    openDetailDrawer(filtered[0].id);
  }
};

// Consulta 2: Por Município (CONSULTA ESPACIAL DINÂMICA ST_Intersects)
window.searchByMunicipality = function () {
  const selectedMuni = document.getElementById("select-municipio").value;

  if (selectedMuniPolygon) {
    map.removeLayer(selectedMuniPolygon);
    selectedMuniPolygon = null;
  }

  if (!selectedMuni) {
    applyFilter(AEFS_DATA);
    window.resetMapView();
    return;
  }

  // Identificar limite territorial oficial do município selecionado
  const muniData = (typeof LIMITES_MUNICIPAIS_DATA !== "undefined")
    ? LIMITES_MUNICIPAIS_DATA.find((m) => m.nome.toLowerCase() === selectedMuni.toLowerCase())
    : MUNICIPOS_DATA.find((m) => m.nome.toLowerCase() === selectedMuni.toLowerCase());

  if (!muniData) {
    applyFilter([]);
    return;
  }

  // Realizar consulta espacial ST_Intersects entre o limite municipal e as AEFs
  const filtered = AEFS_DATA.filter((aef) => stIntersectsFeatureWithMunicipality(aef, muniData));
  applyFilter(filtered);

  // Destacar o limite territorial oficial e focar a câmera no município
  const rawParts = muniData.parts || [muniData.polygon || muniData.geometry];
  if (rawParts && rawParts.length > 0) {
    selectedMuniPolygon = L.featureGroup();
    const highlightStyle = {
      pane: 'municipiosPane',
      color: "#ffd100",
      weight: 3,
      fillColor: "#2b3294",
      fillOpacity: 0.12,
      interactive: false
    };

    rawParts.forEach((p) => {
      if (p && p.length > 0) {
        selectedMuniPolygon.addLayer(L.polygon(p, highlightStyle));
      }
    });

    selectedMuniPolygon.addTo(map);
    map.fitBounds(selectedMuniPolygon.getBounds(), { padding: [30, 30], maxZoom: 12 });
  } else if (muniData.centroide) {
    map.flyTo(muniData.centroide, muniData.zoom || 11, { duration: 1.2 });
  }
};

// Consulta 3: Busca Combinada (AEF + Município Espacial + Status)
window.searchCombined = function () {
  const aefNum = document.getElementById("combo-aef-num").value.trim().toLowerCase();
  const muni = document.getElementById("combo-municipio").value;
  const status = document.getElementById("combo-status").value;

  let muniData = null;
  if (muni) {
    muniData = (typeof LIMITES_MUNICIPAIS_DATA !== "undefined")
      ? LIMITES_MUNICIPAIS_DATA.find((m) => m.nome.toLowerCase() === muni.toLowerCase())
      : MUNICIPOS_DATA.find((m) => m.nome.toLowerCase() === muni.toLowerCase());
  }

  const filtered = AEFS_DATA.filter((item) => {
    const matchAEF = !aefNum || item.numero_aef.toLowerCase().includes(aefNum);
    const matchStatus = !status || item.status === status;
    const matchMuni = !muniData || stIntersectsFeatureWithMunicipality(item, muniData);
    return matchAEF && matchStatus && matchMuni;
  });

  applyFilter(filtered);

  if (muniData) {
    if (selectedMuniPolygon) {
      map.removeLayer(selectedMuniPolygon);
      selectedMuniPolygon = null;
    }

    const rawParts = muniData.parts || [muniData.polygon || muniData.geometry];
    if (rawParts && rawParts.length > 0) {
      selectedMuniPolygon = L.featureGroup();
      rawParts.forEach((p) => {
        if (p && p.length > 0) {
          selectedMuniPolygon.addLayer(L.polygon(p, {
            pane: 'municipiosPane',
            color: "#ffd100",
            weight: 3,
            fillColor: "#2b3294",
            fillOpacity: 0.12,
            interactive: false
          }));
        }
      });
      selectedMuniPolygon.addTo(map);
      map.fitBounds(selectedMuniPolygon.getBounds(), { padding: [30, 30], maxZoom: 12 });
    } else if (muniData.centroide) {
      map.flyTo(muniData.centroide, muniData.zoom || 11, { duration: 1.2 });
    }
  }
};

// Consulta 4: Reserva Legal
window.searchARL = async function () {
  const car = document.getElementById("arl-car").value.trim();
  const cpf = document.getElementById("arl-cpf").value.trim();
  const muni = document.getElementById("arl-municipio").value.trim();

  // Clear previous ARL layer
  if (arlLayerGroup) {
    arlLayerGroup.clearLayers();
  }
  currentArlList = [];
  
  if (!car && !cpf && !muni) {
    alert("Informe pelo menos um critério (CAR, CPF ou Município) para buscar Reserva Legal.");
    return;
  }

  try {
    // Show a small loading indicator in UI if needed (using alert or similar)
    const url = new URL("http://localhost:8080/api/arl/search");
    if (car) url.searchParams.append("car", car);
    if (cpf) url.searchParams.append("cpf", cpf);
    if (muni) url.searchParams.append("municipio", muni);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("Erro ao buscar no backend ARL: " + res.status);
    
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      currentArlList = data.features;
      renderArlFeatures(currentArlList);
    } else {
      alert("Nenhuma Reserva Legal encontrada com os critérios informados.");
    }
  } catch (error) {
    console.error("ARL Search Error:", error);
    alert("Erro ao buscar Reserva Legal. O backend C# está rodando?");
  }
};

function renderArlFeatures(features) {
  if (!arlLayerGroup) return;
  arlLayerGroup.clearLayers();

  let bounds = L.latLngBounds();

  features.forEach(feature => {
    const props = feature.properties || {};
    
    // Style for Reserva Legal (Green borders, transparent fill or light green)
    const arlStyle = {
      pane: 'arlPane',
      color: "#16a34a", // Tailwind green-600
      weight: 2,
      fillColor: "#4ade80", // Tailwind green-400
      fillOpacity: 0.3
    };

    const poly = L.geoJSON(feature, {
      style: arlStyle,
      onEachFeature: function(f, layer) {
        // Tooltip
        const tipContent = `
          <div class="aef-tooltip-card" style="border-left: 4px solid #16a34a;">
            <div class="aef-tooltip-header">
              <span>🌲 Reserva Legal</span>
            </div>
            <div class="aef-tooltip-body">
              <p style="margin:2px 0;"><strong style="color:#fff;">CAR:</strong> <span style="color:#ffd100; font-family:monospace;">${props.car || 'N/A'}</span></p>
              <p style="margin:2px 0;"><strong style="color:#fff;">CPF/CNPJ:</strong> ${props.cpf_cnpj || 'N/A'}</p>
              <p style="margin:2px 0;"><strong style="color:#fff;">Condição:</strong> ${props.condicao || 'N/A'}</p>
              <p style="margin:2px 0;"><strong style="color:#fff;">Área:</strong> ${props.area ? props.area.toFixed(2) + ' ha' : 'N/A'}</p>
            </div>
          </div>
        `;
        layer.bindTooltip(tipContent, { sticky: true, opacity: 1.0 });

        layer.on('click', () => {
          openArlDetailDrawer(props);
        });

        layer.on("mouseover", () => {
          layer.setStyle({ fillOpacity: 0.7, weight: 3 });
          layer.bringToFront();
        });
        layer.on("mouseout", () => {
          layer.setStyle({ fillOpacity: 0.3, weight: 2 });
        });
      }
    });

    arlLayerGroup.addLayer(poly);
    bounds.extend(poly.getBounds());
  });

  if (bounds.isValid() && window.isArlLayerVisible !== false) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }
}

// --------------------------------------------------------------------------
// 4. RENDERIZAÇÃO DE AUTORIZAÇÕES IBAMA / SINAFLOR (PAMGIA)
// --------------------------------------------------------------------------
function renderIbamaFeatures() {
  if (!ibamaLayerGroup || typeof AUTORIZACOES_IBAMA_DATA === 'undefined') return;
  ibamaLayerGroup.clearLayers();

  const ibamaCanvasRenderer = L.canvas({ padding: 0.5, pane: 'ibamaPane' });
  const statusColor = "#f97316"; // Laranja PAMGIA / SINAFLOR

  AUTORIZACOES_IBAMA_DATA.forEach((item) => {
    if (!item.geometry || item.geometry.length === 0) return;

    const poly = L.polygon(item.geometry, {
      renderer: ibamaCanvasRenderer,
      pane: 'ibamaPane',
      color: statusColor,
      weight: 1.5,
      fillColor: statusColor,
      fillOpacity: 0.35
    });

    const tipContent = `
      <div class="aef-tooltip-card" style="border-left: 4px solid ${statusColor};">
        <div class="aef-tooltip-header"><span>🌳 IBAMA / SINAFLOR: ${item.numero_aef || item.id}</span></div>
        <div class="aef-tooltip-body">
          <p><strong style="color:#fff;">Imóvel:</strong> ${item.imovel || "-"}</p>
          <p><strong style="color:#fff;">Órgão:</strong> ${item.nm_orgao || "IBAMA / NATURATINS"}</p>
          <p><strong style="color:#fff;">Município:</strong> ${item.municipio || "-"} - TO</p>
          <p><strong style="color:#fff;">Atividade:</strong> ${item.atividade || "-"}</p>
          <p><strong style="color:#fff;">Área:</strong> ${typeof item.area_ha === "number" ? item.area_ha.toLocaleString("pt-BR") : item.area_ha} ha</p>
          <p><strong style="color:#fff;">Validade:</strong> ${item.emissao || "-"} a ${item.validade || "-"}</p>
          <p><strong style="color:#fff;">Status:</strong> <span style="color:#fdba74; font-weight:700;">${item.status || "Emitida"}</span></p>
        </div>
      </div>
    `;

    poly.bindTooltip(tipContent, { sticky: true, opacity: 1.0 });

    poly.on("mouseover", () => {
      poly.setStyle({ fillOpacity: 0.75, weight: 2.5 });
    });
    poly.on("mouseout", () => {
      poly.setStyle({ fillOpacity: 0.35, weight: 1.5 });
    });
    poly.on("click", () => {
      openIbamaDetailDrawer(item);
    });

    ibamaLayerGroup.addLayer(poly);
  });
}

// Reset de Filtros
window.resetFilters = function () {
  document.getElementById("input-aef-num").value = "";
  document.getElementById("select-municipio").value = "";
  document.getElementById("combo-aef-num").value = "";
  document.getElementById("combo-municipio").value = "";
  document.getElementById("combo-status").value = "";

  if (selectedMuniPolygon) {
    map.removeLayer(selectedMuniPolygon);
    selectedMuniPolygon = null;
  }

  applyFilter(AEFS_DATA);
  window.resetMapView();
  closeDetailDrawer();
};

function applyFilter(dataList) {
  currentAEFsList = dataList;
  updateKPIs(dataList);
  renderResultsList(dataList);
  renderMapFeatures(dataList);
}

// --------------------------------------------------------------------------
// 5. SIDEBAR RESULTS
// --------------------------------------------------------------------------
function renderResultsList(dataList) {
  const container = document.getElementById("results-container");
  container.innerHTML = "";

  if (dataList.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem 1rem; color: var(--text-dim);">
        <svg viewBox="0 0 24 24" style="width:36px; height:36px; stroke:currentColor; fill:none; stroke-width:1.5; margin-bottom:0.5rem;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <p style="font-size: 0.85rem; font-weight:600;">Nenhuma AEF encontrada no NATURATINS</p>
        <span style="font-size: 0.75rem;">Ajuste os critérios de busca.</span>
      </div>
    `;
    return;
  }

  const displayList = dataList.slice(0, 150);

  displayList.forEach((item) => {
    const card = document.createElement("div");
    card.className = `aef-card ${selectedAEF && selectedAEF.id === item.id ? "selected" : ""}`;
    card.dataset.id = item.id;

    card.innerHTML = `
      <div class="aef-card-top">
        <span class="aef-number">${item.numero_aef}</span>
        <span class="status-tag ${item.status}">${item.status.replace("_", " ")}</span>
      </div>
      <div class="aef-title">${item.imovel}</div>
      <div class="aef-details">
        <span>📍 ${item.municipio} - TO</span>
        <span>🌲 ${item.area_ha.toLocaleString("pt-BR")} ha</span>
      </div>
    `;

    card.addEventListener("click", () => {
      selectAEF(item);
    });

    container.appendChild(card);
  });

  if (dataList.length > 150) {
    const moreNotice = document.createElement("div");
    moreNotice.style.cssText = "text-align:center; padding:0.5rem; font-size:0.75rem; color:var(--text-dim); font-style:italic;";
    moreNotice.innerText = `Exibindo 150 de ${dataList.length.toLocaleString("pt-BR")} registros. Refine a busca para ver registros específicos.`;
    container.appendChild(moreNotice);
  }
}

function updateKPIs(dataList) {
  const totalAEFs = dataList.length;
  const totalArea = dataList.reduce((acc, curr) => acc + (curr.area_ha || 0), 0);
  const totalMunis = (typeof LIMITES_MUNICIPAIS_DATA !== "undefined") ? LIMITES_MUNICIPAIS_DATA.length : 139;

  document.getElementById("total-aefs-count").innerText = totalAEFs.toLocaleString("pt-BR");
  document.getElementById("total-area-count").innerText = `${totalArea.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha`;
  document.getElementById("total-muni-count").innerText = totalMunis;
}

// --------------------------------------------------------------------------
// 6. RENDERIZAÇÃO GEOESPACIAL DE AEFs NO MAPA (APENAS POLÍGONOS DAS ÁREAS)
// --------------------------------------------------------------------------
function renderMapFeatures(dataList) {
  mapMarkers.forEach((m) => map.removeLayer(m));
  mapPolygons.forEach((p) => map.removeLayer(p));
  mapMarkers = [];
  mapPolygons = [];

  if (dataList.length === 0) return;

  const bounds = L.latLngBounds();
  const mapList = dataList.slice(0, 500);

  mapList.forEach((item) => {
    let statusColor = "#10b981"; // Ativa
    if (item.status === "EM_ANALISE") statusColor = "#ffd100";
    if (item.status === "SUSPENSA") statusColor = "#ef4444";
    if (item.status === "DESEMBARGO") statusColor = "#a855f7";

    const geomData = item.geometry || item.polygon;

    if (geomData && geomData.length > 0) {
      const polygon = L.polygon(geomData, {
        pane: 'aefPane',
        color: statusColor,
        weight: 2,
        fillColor: statusColor,
        fillOpacity: 0.45
      });
      
      if (window.isAefLayerVisible !== false) {
        polygon.addTo(map);
      }

      // Tooltip flutuante de alta visibilidade exibido ao posicionar o mouse sobre a AEF
      const aefTooltip = `
        <div class="aef-tooltip-card" style="border-left: 4px solid ${statusColor};">
          <div class="aef-tooltip-header">
            <span>🌲 Processo AEF: ${item.numero_aef}</span>
          </div>
          <div class="aef-tooltip-body">
            <p style="margin:2px 0;"><strong style="color:#fff;">Imóvel:</strong> ${item.imovel}</p>
            <p style="margin:2px 0;"><strong style="color:#fff;">Requerente:</strong> ${item.titular}</p>
            <p style="margin:2px 0;"><strong style="color:#fff;">Município:</strong> ${item.municipio} - TO</p>
            <p style="margin:2px 0;"><strong style="color:#fff;">CAR:</strong> <span style="color:#ffd100; font-family:monospace;">${item.car}</span></p>
            <p style="margin:2px 0;"><strong style="color:#fff;">Área Autorizada:</strong> ${item.area_ha.toLocaleString("pt-BR")} ha</p>
            <p style="margin:2px 0;"><strong style="color:#fff;">Validade:</strong> ${item.validade}</p>
            <p style="margin:3px 0 0 0;"><strong style="color:#fff;">Status:</strong> <span style="color:${statusColor}; font-weight:bold;">${item.status_label || item.status}</span></p>
          </div>
        </div>
      `;

      const popupContent = `
        <div class="popup-custom" style="min-width: 220px; padding: 4px;">
          <div style="background-color: #2b3294; color: #ffd100; padding: 6px 10px; border-radius: 4px 4px 0 0; font-weight: bold; font-size: 0.85rem;">
            Processo N° ${item.numero_aef}
          </div>
          <div style="padding: 8px 4px; font-size: 0.78rem; line-height: 1.5; color: #1e293b;">
            <p style="margin: 2px 0;"><strong>Requerente:</strong> ${item.titular}</p>
            <p style="margin: 2px 0;"><strong>Imóvel:</strong> ${item.imovel}</p>
            <p style="margin: 2px 0;"><strong>Município:</strong> ${item.municipio} - TO</p>
            <p style="margin: 2px 0;"><strong>CAR:</strong> <code style="background:#f1f5f9; padding:1px 4px; border-radius:3px;">${item.car}</code></p>
            <p style="margin: 2px 0;"><strong>Área:</strong> 🌲 ${item.area_ha.toLocaleString("pt-BR")} hectares</p>
            <p style="margin: 2px 0;"><strong>Emissão / Validade:</strong> ${item.emissao} a ${item.validade}</p>
            <p style="margin: 2px 0;"><strong>Status:</strong> <span style="color:${statusColor}; font-weight:bold;">${item.status_label || item.status}</span></p>
          </div>
          <button onclick="window.selectAEFById('${item.id}')" style="width: 100%; background: #ffd100; color: #1e293b; border: none; padding: 6px; font-weight: bold; border-radius: 4px; cursor: pointer; margin-top: 4px; font-size: 0.75rem;">
            📋 Abrir Ficha Completa de Atributos
          </button>
        </div>
      `;

      polygon.bindTooltip(aefTooltip, { sticky: true, opacity: 1.0 });
      polygon.bindPopup(popupContent);
      
      polygon.on("click", () => selectAEF(item));
      polygon.on("mouseover", () => {
        polygon.bringToFront();
        polygon.setStyle({ fillOpacity: 0.8, weight: 3 });
      });
      polygon.on("mouseout", () => {
        if (!selectedAEF || selectedAEF.id !== item.id) {
          polygon.setStyle({ fillOpacity: 0.45, weight: 2 });
        }
      });

      mapPolygons.push(polygon);
      bounds.extend(polygon.getBounds());
    } else if (item.centroide) {
      bounds.extend(item.centroide);
    }
  });

  if (dataList.length > 0 && dataList.length < AEFS_DATA.length && mapList.length > 0 && bounds.isValid()) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }
}

// --------------------------------------------------------------------------
// 7. SELEÇÃO E FICHA TÉCNICA
// --------------------------------------------------------------------------
function selectAEF(item) {
  selectedAEF = item;

  document.querySelectorAll(".aef-card").forEach((card) => {
    if (card.dataset.id === item.id) {
      card.classList.add("selected");
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      card.classList.remove("selected");
    }
  });

  map.flyTo(item.centroide, 13, { duration: 1.2 });
  openDetailDrawer(item);
}

window.selectAEFById = function (id) {
  const item = AEFS_DATA.find((a) => a.id === id);
  if (item) {
    selectAEF(item);
  }
};

function openDetailDrawer(itemOrId) {
  let item = itemOrId;
  if (typeof itemOrId === "string") {
    item = AEFS_DATA.find((a) => a.id === itemOrId);
  }

  if (!item) return;
  selectedAEF = item;

  document.getElementById("drawer-aef-number").innerText = item.numero_aef;
  document.getElementById("drawer-titular").innerText = item.titular;
  document.getElementById("drawer-municipio").innerText = `${item.municipio} - TO`;
  document.getElementById("drawer-imovel").innerText = item.imovel;
  document.getElementById("drawer-car").innerText = item.car;
  document.getElementById("drawer-area").innerText = `${item.area_ha.toLocaleString("pt-BR")} hectares`;
  document.getElementById("drawer-emissao").innerText = item.emissao;
  document.getElementById("drawer-validade").innerText = item.validade;
  document.getElementById("drawer-atividade").innerText = item.atividade;
  document.getElementById("drawer-nota").innerText = item.nota_tecnica;

  const badge = document.getElementById("drawer-status-badge");
  badge.className = `status-tag ${item.status}`;
  badge.innerText = item.status_label || item.status;

  const drawer = document.getElementById("detail-drawer");
  drawer.classList.add("active");
}

window.openArlDetailDrawer = function(props) {
  document.getElementById("drawer-aef-number").innerText = "Reserva Legal";
  document.getElementById("drawer-titular").innerText = props.cpf_cnpj || "-";
  document.getElementById("drawer-municipio").innerText = (props.municipio || "") + (props.municipio ? " - TO" : "-");
  document.getElementById("drawer-imovel").innerText = "Reserva Legal (CAR)";
  document.getElementById("drawer-car").innerText = props.car || "-";
  document.getElementById("drawer-area").innerText = props.area ? props.area.toFixed(4) + " hectares" : "-";
  document.getElementById("drawer-emissao").innerText = "-";
  document.getElementById("drawer-validade").innerText = "-";
  document.getElementById("drawer-atividade").innerText = "Preservação Ambiental / Reserva Legal";
  document.getElementById("drawer-nota").innerText = "Dados oriundos do SICAR/CAR";

  const badge = document.getElementById("drawer-status-badge");
  badge.className = "status-tag ATIVA"; // Ou crie classe baseada em props.condicao
  badge.innerText = props.condicao || "ATIVA";
  
  // Customizar cor/estilo do badge para ARL
  badge.style.backgroundColor = "#dcfce7";
  badge.style.color = "#166534";
  badge.style.border = "1px solid #22c55e";

  const drawer = document.getElementById("detail-drawer");
  drawer.classList.add("active");
};

window.openIbamaDetailDrawer = function (item) {
  selectedAEF = item;

  document.getElementById("drawer-aef-number").innerText = `IBAMA / SINAFLOR: ${item.numero_aef || item.id}`;
  document.getElementById("drawer-titular").innerText = item.titular || "-";
  document.getElementById("drawer-municipio").innerText = `${item.municipio || "-"} - TO`;
  document.getElementById("drawer-imovel").innerText = item.imovel || "-";
  document.getElementById("drawer-car").innerText = item.car || "-";
  document.getElementById("drawer-area").innerText = typeof item.area_ha === "number" ? `${item.area_ha.toLocaleString("pt-BR")} hectares` : `${item.area_ha} hectares`;
  document.getElementById("drawer-emissao").innerText = item.emissao || "-";
  document.getElementById("drawer-validade").innerText = item.validade || "-";
  document.getElementById("drawer-atividade").innerText = item.atividade || "Exploração Florestal / ASV";
  document.getElementById("drawer-nota").innerText = `Órgão Emissor: ${item.nm_orgao || "IBAMA / NATURATINS"} | Recibo: ${item.nu_recibo || "-"} | Bioma: ${item.bioma || "Cerrado"}`;

  const badge = document.getElementById("drawer-status-badge");
  badge.className = "status-tag ATIVA";
  badge.innerText = item.status || "AUTORIZAÇÃO EMITIDA";
  badge.style.backgroundColor = "#ffedd5";
  badge.style.color = "#c2410c";
  badge.style.border = "1px solid #f97316";

  const drawer = document.getElementById("detail-drawer");
  drawer.classList.add("active");
};

window.closeDetailDrawer = function () {
  const drawer = document.getElementById("detail-drawer");
  drawer.classList.remove("active");
};

// --------------------------------------------------------------------------
// 8. CONTROLES E RELATÓRIO
// --------------------------------------------------------------------------
window.zoomInMap = function () {
  map.zoomIn();
};

window.zoomOutMap = function () {
  map.zoomOut();
};

window.resetMapView = function () {
  map.setView([-10.1844, -48.3336], 7);
};

window.zoomToCurrentAEF = function () {
  if (selectedAEF) {
    map.flyTo(selectedAEF.centroide, 14, { duration: 1 });
  }
};

window.printAEFReport = function () {
  if (!selectedAEF) return;
  const printWindow = window.open("", "_blank");
  printWindow.document.write(`
    <html>
      <head>
        <title>NATURATINS - Relatório AEF ${selectedAEF.numero_aef}</title>
        <style>
          body { font-family: sans-serif; padding: 20px; line-height: 1.6; color: #1e293b; }
          .header-brand { text-align: center; border-bottom: 3px solid #2b3294; padding-bottom: 10px; margin-bottom: 20px; }
          .header-brand h1 { color: #2b3294; margin: 0; font-size: 1.4rem; }
          .header-brand h3 { color: #64748b; margin: 5px 0 0 0; font-size: 0.9rem; font-weight: normal; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
          th { background: #f1f5f9; color: #1e293b; }
          .status-box { background: #fef9c3; border-left: 4px solid #ffd100; padding: 12px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="header-brand">
          <h1>INSTITUTO NATUREZA DO TOCANTINS - NATURATINS</h1>
          <h3>FICHA TÉCNICA DE AUTORIZAÇÃO FLORESTAL (AEF)</h3>
        </div>
        <div class="status-box">
          <strong>Processo N°:</strong> ${selectedAEF.numero_aef}<br>
          <strong>Status:</strong> ${selectedAEF.status_label}<br>
          <strong>Emissão:</strong> ${selectedAEF.emissao} | <strong>Validade:</strong> ${selectedAEF.validade}
        </div>
        <table>
          <tr><th>Requerente / Titular</th><td>${selectedAEF.titular}</td></tr>
          <tr><th>Imóvel / Processo</th><td>${selectedAEF.imovel}</td></tr>
          <tr><th>Município</th><td>${selectedAEF.municipio} - TO</td></tr>
          <tr><th>Código CAR</th><td>${selectedAEF.car}</td></tr>
          <tr><th>Área Autorizada</th><td>${selectedAEF.area_ha.toLocaleString("pt-BR")} hectares</td></tr>
          <tr><th>Atividade Autorizada</th><td>${selectedAEF.atividade}</td></tr>
          <tr><th>Notas Técnicas CIGMA</th><td>${selectedAEF.nota_tecnica}</td></tr>
        </table>
        <br><br>
        <p style="font-size:0.8rem; color:#64748b; text-align:center;">Emitido via Painel Geográfico Oficial NATURATINS em ${new Date().toLocaleDateString("pt-BR")}</p>
        <script>window.print();</script>
      </body>
    </html>
  `);
  printWindow.document.close();
};
