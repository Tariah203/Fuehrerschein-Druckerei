import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { jsPDF } from 'jspdf';

const DEFAULT_BACKGROUND_URL = "https://otcegorzfuyumnflanas.supabase.co/storage/v1/object/public/passbilder/Fahrausweis-fuer-Krane-1024x724-2.jpeg";

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
  const iframeRef = useRef(null);

  // Datensätze aus Supabase laden
  const fetchRecords = async () => {
    try {
      const { data, error } = await supabase
        .from('fuehrerschein_daten')
        .select('*')
        .order('id', { ascending: true });
      if (error) throw error;
      setRecords(data || []);
      if (data && data.length > 0 && currentIndex === -1) {
        loadRecord(data[0], 0);
      }
    } catch (err) {
      console.error('Fehler beim Laden:', err.message);
    }
  };

  useEffect(() => {
    fetchRecords();
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
      const photoX = 6;
      const photoY = 116;
      const photoW = 28;
      const photoH = 37;
      const textX = 36;

      doc.setFont('Helvetica', 'normal');
      doc.setTextColor(0, 0, 0);

      if (formData.vorname) {
        doc.setFontSize(9);
        doc.text(formData.vorname, textX, 120);
      }
      if (formData.nachname) {
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(formData.nachname, 33);
        lines.slice(0, 2).forEach((l, i) => doc.text(l, textX, 128 + (i * 3.8)));
      }
      if (formData.gebAm) {
        doc.setFontSize(9);
        doc.text(formData.gebAm, textX, 140);
      }
      if (formData.gebOrt) {
        doc.setFontSize(9);
        const lines = doc.splitTextToSize(formData.gebOrt, 33);
        lines.slice(0, 2).forEach((l, i) => doc.text(l, textX, 146 + (i * 3.8)));
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
      <main className="max-w-7xl w-full mx-auto p-4 md:p-8 flex-1">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Linke Spalte: Formular */}
          <div className="lg:col-span-5 bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200">
            <form onSubmit={handleSubmitAndPrint} className="space-y-4">
              
              {/* Foto Upload & Mini-Vorschau */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Foto</label>
                <div className="flex items-center space-x-3">
                  {photoPreview && (
                    <img 
                      src={photoPreview} 
                      alt="Passfoto" 
                      onClick={() => setIsModalOpen(true)}
                      className="w-10 h-12 object-cover object-left rounded border border-slate-300 cursor-pointer hover:opacity-80 transition-all shrink-0" 
                    />
                  )}
                  <label className="cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 flex items-center space-x-2 transition-all w-full justify-center">
                    <span>{selectedFile ? selectedFile.name : (photoPreview ? 'Anderes Foto wählen...' : 'Passfoto auswählen...')}</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />
                  </label>
                  {photoPreview && (
                    <button type="button" onClick={removePhoto} className="bg-red-50 hover:bg-red-100 text-red-600 p-2.5 rounded-lg border border-red-200" title="Foto löschen">
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Vorname */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Vorname</label>
                <input
                  type="text"
                  placeholder="Vorname"
                  value={formData.vorname}
                  onChange={e => setFormData({ ...formData, vorname: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm outline-none"
                />
              </div>

              {/* Nachname */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Name <span className="text-xs font-normal text-slate-500">(max. 2 Zeilen)</span></label>
                <textarea
                  rows="2"
                  placeholder="Nachname / Familienname"
                  value={formData.nachname}
                  onChange={e => setFormData({ ...formData, nachname: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm outline-none resize-none"
                />
              </div>

              {/* geb. am */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">geb. am</label>
                <input
                  type="text"
                  placeholder="TT.MM.JJJJ"
                  maxLength={10}
                  value={formData.gebAm}
                  onChange={e => handleDateChange(e.target.value)}
                  onBlur={finalizeDate}
                  className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 text-sm outline-none ${
                    dateError ? 'border-red-500 bg-red-50 focus:ring-red-500' : 'bg-slate-50 border-slate-300 focus:ring-indigo-500 focus:bg-white'
                  }`}
                />
                {dateError && <p className="text-xs text-red-600 mt-1">Ungültiges Datum (z. B. 15.05.1990).</p>}
              </div>

              {/* in (Geburtsort) */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">in <span className="text-xs font-normal text-slate-500">(Geburtsort, max. 2 Zeilen)</span></label>
                <textarea
                  rows="2"
                  placeholder="Geburtsort"
                  value={formData.gebOrt}
                  onChange={e => setFormData({ ...formData, gebOrt: e.target.value })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white text-sm outline-none resize-none"
                />
              </div>

              {/* Speichern & Drucken */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-all text-base disabled:opacity-50"
                >
                  {loading ? (statusMsg || 'Verarbeite...') : 'Speichern & Drucken'}
                </button>
              </div>

              {/* Navigation & Aktionen */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex items-center space-x-1">
                  <button type="button" onClick={() => loadRecord(records[0], 0)} disabled={currentIndex <= 0} className="px-2.5 py-1.5 border rounded bg-slate-50 disabled:opacity-40 text-xs font-bold">|&lt;</button>
                  <button type="button" onClick={() => loadRecord(records[currentIndex - 1], currentIndex - 1)} disabled={currentIndex <= 0} className="px-2.5 py-1.5 border rounded bg-slate-50 disabled:opacity-40 text-xs font-bold">&lt;</button>
                  <span className="text-xs text-slate-500 px-2">{records.length > 0 && currentIndex >= 0 ? `${currentIndex + 1} / ${records.length}` : '- / -'}</span>
                  <button type="button" onClick={() => loadRecord(records[currentIndex + 1], currentIndex + 1)} disabled={currentIndex >= records.length - 1 || currentIndex === -1} className="px-2.5 py-1.5 border rounded bg-slate-50 disabled:opacity-40 text-xs font-bold">&gt;</button>
                  <button type="button" onClick={() => loadRecord(records[records.length - 1], records.length - 1)} disabled={currentIndex >= records.length - 1 || currentIndex === -1} className="px-2.5 py-1.5 border rounded bg-slate-50 disabled:opacity-40 text-xs font-bold">&gt;|</button>
                </div>
                <div className="flex items-center space-x-2">
                  <button type="button" onClick={handleNew} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border rounded text-xs font-semibold">+ Neu</button>
                  <button type="button" onClick={handleDelete} disabled={!formData.id} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded text-xs font-semibold disabled:opacity-40">🗑 Löschen</button>
                </div>
              </div>

            </form>
          </div>

          {/* Rechte Spalte: Live-Vorschau */}
          <div className="lg:col-span-7 flex flex-col items-center">
            <div className="w-full bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col items-center">
              <div 
                className="w-full relative shadow border border-slate-200 overflow-hidden" 
                style={{ aspectRatio: '1024 / 724', backgroundImage: `url(${DEFAULT_BACKGROUND_URL})`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }}
              >
                {/* Passfoto Vorschau */}
                <div className="absolute top-[39.2%] left-[2.1%] w-[9.4%] h-[25.2%] flex items-center justify-center overflow-hidden">
                  {photoPreview && (
                    <img src={photoPreview} alt="Vorschau" className="w-full h-full object-cover object-left" />
                  )}
                </div>

                {/* Vorname */}
                <div className="absolute top-[40.6%] left-[12.2%] w-[11.1%] text-[1.1cqw] leading-none text-slate-900 font-sans truncate">
                  {formData.vorname}
                </div>

                {/* Nachname */}
                <div className="absolute top-[43.3%] left-[12.2%] w-[11.1%] text-[1.1cqw] leading-tight text-slate-900 font-sans break-words line-clamp-2">
                  {formData.nachname}
                </div>

                {/* geb. am */}
                <div className="absolute top-[47.4%] left-[12.2%] w-[11.1%] text-[1.1cqw] leading-none text-slate-900 font-sans truncate">
                  {!dateError ? formData.gebAm : ''}
                </div>

                {/* in */}
                <div className="absolute top-[49.4%] left-[12.2%] w-[11.1%] text-[1.1cqw] leading-tight text-slate-900 font-sans break-words line-clamp-2">
                  {formData.gebOrt}
                </div>
              </div>
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

      <iframe ref={iframeRef} className="hidden" title="Print" />
    </div>
  );
}