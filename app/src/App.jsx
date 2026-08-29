import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { jsPDF } from 'jspdf';

const DEFAULT_BACKGROUND_URL = "https://otcegorzfuyumnflanas.supabase.co/storage/v1/object/public/passbilder/Fahrausweis-fuer-Krane-1024x724-2.jpeg";
const NEUTRANSLOG_LOGO_URL = "https://otcegorzfuyumnflanas.supabase.co/storage/v1/object/public/passbilder/LogoV2-2.png.pagespeed.ce.QYxV0-0Nbp.png";
const A4_WIDTH_MM = 297;
const A4_HEIGHT_MM = 210;
const PREVIEW_WIDTH = 1024;
const PREVIEW_HEIGHT = 724;
const FIELD_POSITIONS = {
  photo: { top: 54, left: 2.4, width: 11.5, height: 21.4 },
  firstName: { baseline: 55.28, left: 18.71, width: 6.8, previewFontPx: 8, pdfSize: 6 },
  lastName: { baseline: 61.84, left: 14.67, width: 6.8, previewFontPx: 8, pdfSize: 6 },
  birthDate: { baseline: 66.2, left: 19.04, width: 6.8, previewFontPx: 7, pdfSize: 5.5 },
  birthPlace: { baseline: 68.56, left: 16.1, width: 8.4, previewFontPx: 7, pdfSize: 5.5 }
};

const percentToMm = (percent, totalMm) => (percent / 100) * totalMm;

export default function App() {
  const [records, setRecords] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [formData, setFormData] = useState({
    id: null,
    vorname: '',
    nachname: '',
    gebAm: '',
    gebOrt: '',
    foto_url: null
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [dateError, setDateError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const iframeRef = useRef(null);
  const previewOverlayRef = useRef(null);

  useEffect(() => {
    const canvas = previewOverlayRef.current;
    if (!canvas) return;

    canvas.width = PREVIEW_WIDTH;
    canvas.height = PREVIEW_HEIGHT;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    context.fillStyle = '#0f172a';
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';

    const drawText = (value, field, maxLines = 1) => {
      if (!value) return;
      const x = (field.left / 100) * PREVIEW_WIDTH;
      const baseline = (field.baseline / 100) * PREVIEW_HEIGHT;
      const maxWidth = (field.width / 100) * PREVIEW_WIDTH;
      const previewScale = canvas.width / PREVIEW_WIDTH;
      let fontSize = field.previewFontPx
        ? field.previewFontPx / previewScale
        : field.pdfSize * (PREVIEW_WIDTH / A4_WIDTH_MM) * (25.4 / 72);
      const lineHeight = fontSize * 1.25;

      context.font = `${fontSize}px Helvetica, Arial, sans-serif`;
      while (fontSize > 3 && context.measureText(value).width > maxWidth) {
        fontSize -= 0.25;
        context.font = `${fontSize}px Helvetica, Arial, sans-serif`;
      }

      if (maxLines === 1) {
        context.fillText(value, x, baseline, maxWidth);
        return;
      }

      const words = value.split(/\s+/);
      const lines = [];
      let line = '';
      words.forEach(word => {
        const candidate = line ? `${line} ${word}` : word;
        if (line && context.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      });
      if (line) lines.push(line);
      lines.slice(0, maxLines).forEach((text, index) => {
        context.fillText(text, x, baseline + (index * lineHeight), maxWidth);
      });
    };

    const drawPhoto = () => {
      if (!photoPreview) return;
      const image = new Image();
      image.onload = () => {
        const x = (FIELD_POSITIONS.photo.left / 100) * PREVIEW_WIDTH;
        const y = (FIELD_POSITIONS.photo.top / 100) * PREVIEW_HEIGHT;
        const width = (FIELD_POSITIONS.photo.width / 100) * PREVIEW_WIDTH;
        const height = (FIELD_POSITIONS.photo.height / 100) * PREVIEW_HEIGHT;
        const scale = Math.max(width / image.width, height / image.height);
        const drawnWidth = image.width * scale;
        const drawnHeight = image.height * scale;
        const drawnY = y + ((height - drawnHeight) / 2);
        context.save();
        context.beginPath();
        context.rect(x, y, width, height);
        context.clip();
        context.drawImage(image, x, drawnY, drawnWidth, drawnHeight);
        context.restore();
      };
      image.src = photoPreview;
    };

    drawPhoto();
    drawText(formData.vorname, FIELD_POSITIONS.firstName);
    drawText(formData.nachname, FIELD_POSITIONS.lastName, 2);
    drawText(!dateError ? formData.gebAm : '', FIELD_POSITIONS.birthDate);
    drawText(formData.gebOrt, FIELD_POSITIONS.birthPlace, 2);
  }, [dateError, formData.gebAm, formData.gebOrt, formData.nachname, formData.vorname, photoPreview]);

  // Datensätze aus Supabase laden
  const fetchRecords = async () => {
    try {
      const { data, error } = await supabase
        .from('fuehrerschein_daten')
        .select('*')
        .order('id', { ascending: true });
      if (error) throw error;
      setRecords(data || []);
    } catch (err) {
      console.error('Fehler beim Laden:', err.message);
    }
  };

  useEffect(() => {
    fetchRecords();
    handleNew();
  }, []);

  const loadRecord = (rec, idx) => {
    setCurrentIndex(idx);
    setFormData({
      id: rec.id,
      vorname: rec.vorname || '',
      nachname: rec.nachname || '',
      gebAm: formatDateForDisplay(rec.geburtsdatum || ''),
      gebOrt: rec.geburtsort || '',
      foto_url: rec.foto_url || null
    });
    setPhotoPreview(rec.foto_url || null);
    setSelectedFile(null);
    setDateError(false);
  };

  const handleNew = () => {
    setCurrentIndex(-1);
    setFormData({
      id: null,
      vorname: '',
      nachname: '',
      gebAm: '',
      gebOrt: '',
      foto_url: null
    });
    setPhotoPreview(null);
    setSelectedFile(null);
    setDateError(false);
  };

  const isValidDate = (str) => {
    if (!str) return true;
    const parts = str.split('.');
    if (parts.length !== 3) return false;
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const y = parseInt(parts[2], 10);
    if (isNaN(d) || isNaN(m) || isNaN(y) || parts[2].length !== 4) return false;
    if (m < 1 || m > 12) return false;
    const curY = new Date().getFullYear();
    if (y < 1900 || y > curY) return false;
    const daysInMonth = new Date(y, m, 0).getDate();
    return d >= 1 && d <= daysInMonth;
  };

  const formatDateForDisplay = (isoStr) => {
    if (!isoStr) return '';
    if (isoStr.includes('.')) return isoStr;
    const parts = isoStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }
    return isoStr;
  };

  const formatDateForDB = (deStr) => {
    if (!deStr) return null;
    const parts = deStr.split('.');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return deStr;
  };

  const handleDateChange = (val) => {
    let digits = val.replace(/\D/g, '');
    if (digits.length > 8) digits = digits.substring(0, 8);
    let formatted = '';
    if (digits.length > 4) {
      formatted = digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4);
    } else if (digits.length > 2) {
      formatted = digits.slice(0, 2) + '.' + digits.slice(2, 4);
    } else {
      formatted = digits;
    }
    setFormData(prev => ({ ...prev, gebAm: formatted }));
    setDateError(formatted.length > 0 && !isValidDate(formatted));
  };

  const finalizeDate = () => {
    let digits = formData.gebAm.replace(/\D/g, '');
    if (digits.length >= 5) {
      let d = digits.slice(0, 2);
      let m = digits.slice(2, 4);
      let yStr = digits.slice(4);
      if (yStr.length === 2) {
        const yNum = parseInt(yStr, 10);
        const curY = new Date().getFullYear() % 100;
        const fullY = yNum <= curY ? 2000 + yNum : 1900 + yNum;
        const res = `${d}.${m}.${fullY}`;
        setFormData(prev => ({ ...prev, gebAm: res }));
        setDateError(!isValidDate(res));
      }
    }
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const removePhoto = () => {
    setSelectedFile(null);
    setPhotoPreview(null);
    setFormData(prev => ({ ...prev, foto_url: null }));
  };

  const uploadPhoto = async (file) => {
  if (!file) return null;
  const ext = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;
  const { error } = await supabase.storage.from('passbilder').upload(fileName, file);
  if (error) {
    console.warn('Storage Upload Fehler:', error.message);
    return null;
  }
  const { data } = supabase.storage.from('passbilder').getPublicUrl(fileName);
  return data.publicUrl;
};

  const handleDelete = async () => {
    if (!formData.id) return;
    if (!window.confirm('Diesen Datensatz wirklich löschen?')) return;
    try {
      const { error } = await supabase.from('fuehrerschein_daten').delete().eq('id', formData.id);
      if (error) throw error;
      const updated = records.filter(r => r.id !== formData.id);
      setRecords(updated);
      if (updated.length > 0) {
        loadRecord(updated[0], 0);
      } else {
        handleNew();
      }
    } catch (err) {
      alert('Fehler beim Löschen: ' + err.message);
    }
  };

  const getFilteredRecords = () => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return records.filter(rec => 
      (rec.vorname && rec.vorname.toLowerCase().includes(query)) ||
      (rec.nachname && rec.nachname.toLowerCase().includes(query)) ||
      (rec.geburtsdatum && rec.geburtsdatum.includes(query)) ||
      (rec.geburtsort && rec.geburtsort.toLowerCase().includes(query))
    );
  };

  const handleSearchSelect = (rec, idx) => {
    loadRecord(rec, idx);
    setSearchQuery('');
    setShowSearchResults(false);
  };

  const handleSubmitAndPrint = async (e) => {
    e.preventDefault();
    finalizeDate();
    if (formData.gebAm && !isValidDate(formData.gebAm)) {
      setDateError(true);
      return;
    }

    setLoading(true);
    setStatusMsg('Speichere in Supabase...');

    try {
      let finalPhotoUrl = formData.foto_url;
      if (selectedFile) {
        const upUrl = await uploadPhoto(selectedFile);
        if (upUrl) finalPhotoUrl = upUrl;
      }

      const payload = {
        vorname: formData.vorname.trim(),
        nachname: formData.nachname.trim(),
        geburtsdatum: formatDateForDB(formData.gebAm.trim()),
        geburtsort: formData.gebOrt.trim(),
        foto_url: finalPhotoUrl
      };

      if (formData.id) {
        const { error } = await supabase.from('fuehrerschein_daten').update(payload).eq('id', formData.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('fuehrerschein_daten').insert([payload]).select();
        if (error) throw error;
        if (data && data[0]) setFormData(prev => ({ ...prev, id: data[0].id }));
      }

      await fetchRecords();

      // PDF Generieren
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const photoX = percentToMm(FIELD_POSITIONS.photo.left, A4_WIDTH_MM);
      const photoY = percentToMm(FIELD_POSITIONS.photo.top, A4_HEIGHT_MM);
      const photoW = percentToMm(FIELD_POSITIONS.photo.width, A4_WIDTH_MM);
      const photoH = percentToMm(FIELD_POSITIONS.photo.height, A4_HEIGHT_MM);
      const firstNameX = percentToMm(FIELD_POSITIONS.firstName.left, A4_WIDTH_MM);
      const lastNameX = percentToMm(FIELD_POSITIONS.lastName.left, A4_WIDTH_MM);
      const birthDateX = percentToMm(FIELD_POSITIONS.birthDate.left, A4_WIDTH_MM);
      const birthPlaceX = percentToMm(FIELD_POSITIONS.birthPlace.left, A4_WIDTH_MM);
      const lastNameWidth = percentToMm(FIELD_POSITIONS.lastName.width, A4_WIDTH_MM);
      const birthPlaceWidth = percentToMm(FIELD_POSITIONS.birthPlace.width, A4_WIDTH_MM);

      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(0, 0, 0);

      if (formData.vorname) {
        doc.setFontSize(FIELD_POSITIONS.firstName.pdfSize);
        doc.text(formData.vorname, firstNameX, percentToMm(FIELD_POSITIONS.firstName.baseline, A4_HEIGHT_MM));
      }
      if (formData.nachname) {
        doc.setFontSize(FIELD_POSITIONS.lastName.pdfSize);
        const lines = doc.splitTextToSize(formData.nachname, lastNameWidth);
        const lastNameY = percentToMm(FIELD_POSITIONS.lastName.baseline, A4_HEIGHT_MM);
        lines.slice(0, 2).forEach((l, i) => doc.text(l, lastNameX, lastNameY + (i * 2.5)));
      }
      if (formData.gebAm) {
        doc.setFontSize(FIELD_POSITIONS.birthDate.pdfSize);
        doc.text(formData.gebAm, birthDateX, percentToMm(FIELD_POSITIONS.birthDate.baseline, A4_HEIGHT_MM));
      }
      if (formData.gebOrt) {
        doc.setFontSize(FIELD_POSITIONS.birthPlace.pdfSize);
        const lines = doc.splitTextToSize(formData.gebOrt, birthPlaceWidth);
        const birthPlaceY = percentToMm(FIELD_POSITIONS.birthPlace.baseline, A4_HEIGHT_MM);
        lines.slice(0, 2).forEach((l, i) => doc.text(l, birthPlaceX, birthPlaceY + (i * 2.5)));
      }

      if (photoPreview) {
        try {
          doc.addImage(photoPreview, 'JPEG', photoX, photoY, photoW, photoH);
        } catch (err) {
          console.error('Foto im PDF fehlgeschlagen:', err);
        }
      }

      doc.autoPrint();
      const blobUrl = URL.createObjectURL(doc.output('blob'));
      if (iframeRef.current) {
        iframeRef.current.src = blobUrl;
        iframeRef.current.onload = () => {
          setTimeout(() => {
            iframeRef.current.contentWindow.focus();
            iframeRef.current.contentWindow.print();
          }, 300);
        };
      }
    } catch (err) {
      alert('Fehler: ' + err.message);
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans">
      <header className="bg-slate-900 text-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-4 sm:flex-row md:px-8">
          <a href="https://neutranslog.de" target="_blank" rel="noreferrer" aria-label="Neu Trans Log Webseite">
            <img src={NEUTRANSLOG_LOGO_URL} alt="Neu Trans Log Beratung, Schulung, Prüfung" className="h-auto w-64 max-w-full" />
          </a>
          <div className="flex items-center gap-4 text-sm font-medium text-slate-200">
            <span>Ausbildung &amp; Prüfung bundesweit</span>
            <span className="border-l border-slate-600 pl-4">Führerschein-Drucker</span>
          </div>
        </div>
      </header>
      <main className="max-w-7xl w-full mx-auto p-4 md:p-8 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Linke Spalte: Formular */}
          <div className="lg:col-span-12 bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200">
            <form onSubmit={handleSubmitAndPrint} className="space-y-3">
              
              {/* Suchfeld */}
              <div className="relative">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-50 text-slate-500 shadow-sm">
                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <circle cx="11" cy="11" r="6" />
                      <path d="m16 16 5 5" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Nach vorhandenem Eintrag suchen"
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setShowSearchResults(e.target.value.trim().length > 0);
                    }}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm outline-none"
                  />
                </div>
                
                {/* Dropdown mit Suchergebnissen */}
                {showSearchResults && searchQuery.trim().length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-lg z-10 max-h-60 overflow-y-auto">
                    {getFilteredRecords().length > 0 ? (
                      getFilteredRecords().map((rec, idx) => {
                        const recordIdx = records.findIndex(r => r.id === rec.id);
                        return (
                          <button
                            key={rec.id}
                            type="button"
                            onClick={() => handleSearchSelect(rec, recordIdx)}
                            className="w-full text-left px-4 py-3 hover:bg-indigo-50 border-b border-slate-200 last:border-b-0 transition-colors"
                          >
                            <div className="font-semibold text-slate-900">{rec.vorname} {rec.nachname}</div>
                            <div className="text-xs text-slate-500">
                              {rec.geburtsdatum && <span>geb. {rec.geburtsdatum}</span>}
                              {rec.geburtsort && <span> • {rec.geburtsort}</span>}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-500">Keine Einträge gefunden</div>
                    )}
                  </div>
                )}
              </div>
              
              <div className="flex items-stretch gap-4">
                {/* Foto Upload & Vorschau */}
                <div className="shrink-0 self-stretch">
                  <label className="relative block h-full cursor-pointer">
                    <div className="group relative mx-auto flex h-full w-[9.5rem] min-h-[12.5rem] items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 transition-all hover:border-indigo-400 hover:bg-indigo-50">
                      {photoPreview ? (
                        <>
                          <img
                            src={photoPreview}
                            alt="Passfoto"
                            className="h-full w-full object-cover object-center"
                          />
                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 bg-gradient-to-t from-slate-900/55 via-slate-900/10 to-transparent p-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                document.getElementById('photo-upload-input')?.click();
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-md bg-white/85 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white"
                              title="Foto ändern"
                              aria-label="Foto ändern"
                            >
                              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removePhoto();
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-md bg-white/85 text-red-600 shadow-sm backdrop-blur-sm transition hover:bg-white"
                              title="Foto löschen"
                              aria-label="Foto löschen"
                            >
                              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v5" />
                                <path d="M14 11v5" />
                              </svg>
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2 text-slate-600">
                          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-8 w-8">
                            <path d="M12 16V4" />
                            <path d="m7 9 5-5 5 5" />
                            <path d="M20 16.5v1.5A2 2 0 0 1 18 20H6a2 2 0 0 1-2-2v-1.5" />
                          </svg>
                          <span className="text-sm font-semibold">Foto hochladen</span>
                        </div>
                      )}
                      <input id="photo-upload-input" type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                    </div>
                  </label>
                </div>

                <div className="flex-1 self-stretch space-y-3 pt-1">
                  {/* Vorname */}
                  <div className="flex items-center gap-3">
                    <label className="w-20 min-w-20 text-left text-sm font-semibold text-slate-700">Vorname</label>
                    <input
                      type="text"
                      placeholder="Vorname"
                      value={formData.vorname}
                      onChange={e => setFormData({ ...formData, vorname: e.target.value })}
                      className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm outline-none"
                    />
                  </div>

                  {/* Nachname */}
                  <div className="flex items-center gap-3">
                    <label className="w-20 min-w-20 text-left text-sm font-semibold text-slate-700">Nachname</label>
                    <textarea
                      rows="2"
                      placeholder="Nachname"
                      value={formData.nachname}
                      onChange={e => setFormData({ ...formData, nachname: e.target.value })}
                      className="flex-1 px-3.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm outline-none resize-none"
                    />
                  </div>

                  {/* geb. am */}
                  <div className="flex items-center gap-3">
                    <label className="w-20 min-w-20 text-left text-sm font-semibold text-slate-700">geb. am</label>
                    <input
                      type="text"
                      placeholder="TT.MM.JJJJ"
                      maxLength={10}
                      value={formData.gebAm}
                      onChange={e => handleDateChange(e.target.value)}
                      onBlur={finalizeDate}
                      className={`flex-1 px-3.5 py-2 border rounded-lg focus:ring-2 text-sm outline-none ${
                        dateError ? 'border-red-500 bg-red-50 focus:ring-red-500' : 'bg-slate-50 border-slate-300 focus:ring-indigo-500 focus:bg-white'
                      }`}
                    />
                  </div>
                  {dateError && <p className="text-xs text-red-600 mt-1">Ungültiges Datum (z. B. 15.05.1990).</p>}

                  {/* in (Geburtsort) */}
                  <div className="flex items-center gap-3">
                    <label className="w-20 min-w-20 text-left text-sm font-semibold text-slate-700">Geburtsort</label>
                    <textarea
                      rows="2"
                      placeholder="Geburtsort"
                      value={formData.gebOrt}
                      onChange={e => setFormData({ ...formData, gebOrt: e.target.value })}
                      className="flex-1 px-3.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm outline-none resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Speichern & Drucken */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-6 rounded-lg shadow-lg transition-all text-base disabled:opacity-50"
                >
                  {loading ? (statusMsg || 'Verarbeite...') : 'Speichern & Drucken'}
                </button>
              </div>

              {/* Navigation & Aktionen */}
              <div className="flex flex-nowrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <div className="flex shrink-0 items-center space-x-1">
                  <button type="button" onClick={() => loadRecord(records[0], 0)} disabled={currentIndex <= 0} tabIndex="-1" className="shrink-0 whitespace-nowrap px-2 py-1 leading-none border rounded bg-slate-50 disabled:opacity-40 text-xs font-bold">|&lt;</button>
                  <button type="button" onClick={() => loadRecord(records[currentIndex - 1], currentIndex - 1)} disabled={currentIndex <= 0} tabIndex="-1" className="shrink-0 whitespace-nowrap px-2 py-1 leading-none border rounded bg-slate-50 disabled:opacity-40 text-xs font-bold">&lt;</button>
                  <span className="shrink-0 whitespace-nowrap text-xs text-slate-500 px-1">{records.length > 0 && currentIndex >= 0 ? `${currentIndex + 1} / ${records.length}` : '- / -'}</span>
                  <button type="button" onClick={() => loadRecord(records[currentIndex + 1], currentIndex + 1)} disabled={currentIndex >= records.length - 1 || currentIndex === -1} tabIndex="-1" className="shrink-0 whitespace-nowrap px-2 py-1 leading-none border rounded bg-slate-50 disabled:opacity-40 text-xs font-bold">&gt;</button>
                  <button type="button" onClick={() => loadRecord(records[records.length - 1], records.length - 1)} disabled={currentIndex >= records.length - 1 || currentIndex === -1} tabIndex="-1" className="shrink-0 whitespace-nowrap px-2 py-1 leading-none border rounded bg-slate-50 disabled:opacity-40 text-xs font-bold">&gt;|</button>
                </div>
                <div className="flex shrink-0 items-center space-x-1.5">
                  <button type="button" onClick={handleNew} tabIndex="-1" className="shrink-0 whitespace-nowrap px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-xs font-semibold">+ Neuen Datensatz anlegen</button>
                  <button type="button" onClick={handleDelete} disabled={!formData.id} tabIndex="-1" className="shrink-0 whitespace-nowrap px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-xs font-semibold disabled:opacity-40">🗑 Datensatz löschen</button>
                </div>
              </div>

            </form>
          </div>

        </div>

        <div className="mt-8 w-full">
          <h2 className="mb-3 text-left text-lg font-semibold text-slate-700">Druckvorschau</h2>
          <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col items-center">
            <div 
              className="w-full relative shadow border border-slate-200 overflow-hidden" 
              style={{ aspectRatio: '1024 / 724', backgroundImage: `url(${DEFAULT_BACKGROUND_URL})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}
            >
              <canvas
                ref={previewOverlayRef}
                aria-label="Vorschau der eingegebenen Daten"
                className="absolute inset-0 w-full h-full pointer-events-none"
              />
            </div>
          </div>
        </div>
      </main>

      {/* Foto Zoom Modal */}
      {isModalOpen && photoPreview && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setIsModalOpen(false)}>
          <div className="relative max-w-lg max-h-[85vh] bg-white p-2 rounded-xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setIsModalOpen(false)} className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full w-8 h-8 font-bold flex items-center justify-center shadow">✕</button>
            <img src={photoPreview} alt="Grossansicht" className="max-h-[75vh] w-auto rounded object-contain" />
          </div>
        </div>
      )}

      <iframe ref={iframeRef} className="hidden" title="Print" tabIndex="-1" />
    </div>
  );
}