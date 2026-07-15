import React, { useState, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileSpreadsheet, 
  Calendar, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  TrendingUp,
  RotateCcw,
  Sparkles,
  Search,
  Filter,
  Check,
  History,
  ArrowRight,
  ChevronRight,
  BookOpen,
  ArrowUpRight,
  Layers,
  Database,
  ArrowRightLeft
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db, DAILY_RECORDS_COL, OperationType, handleFirestoreError } from '../lib/firebase';
import { OUTLETS, Item } from '../constants';
import { format } from 'date-fns';

interface DateWiseClosingProps {
  items: Item[];
  records: any;
  setRecords: React.Dispatch<React.SetStateAction<any>>;
  currentDate: string;
  setCurrentDate: (date: string) => void;
  selectedOutletId: string;
  setIsSidebarOpen: (open: boolean) => void;
  getPreviousClosingInternal: (allRecords: any, itemId: string, date: string, outletId: string) => number;
  calculateSold: (data: any) => number;
  calculateClosing: (data: any) => number;
  userRole: string;
}

export const DateWiseClosingComponent = React.memo(({
  items,
  records,
  setRecords,
  currentDate,
  setCurrentDate,
  selectedOutletId,
  setIsSidebarOpen,
  getPreviousClosingInternal,
  calculateSold,
  calculateClosing,
  userRole
}: DateWiseClosingProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeTab, setActiveTab] = useState<'entry' | 'history'>('entry');
  const [saveStatus, setSaveStatus] = useState<{ [key: string]: 'idle' | 'saving' | 'saved' | 'error' }>({});
  const tableRef = useRef<HTMLTableElement | null>(null);

  // Filter items to only include active cakes and pastries
  const cakeAndPastryItems = useMemo(() => {
    return (items || []).filter(item => {
      const cat = (item.category || '').toLowerCase();
      return cat.includes('cake') || cat.includes('pastry') || cat.includes('pastries');
    });
  }, [items]);

  // Get the outlet name
  const outletName = useMemo(() => {
    return OUTLETS.find(o => o.id === selectedOutletId)?.name || `Outlet ${selectedOutletId}`;
  }, [selectedOutletId]);

  // Extract all categories for filtering
  const categories = useMemo(() => {
    const cats = new Set<string>();
    cakeAndPastryItems.forEach(item => {
      if (item.status !== 'inactive' && item.category) {
        cats.add(item.category);
      }
    });
    return ['all', ...Array.from(cats).sort()];
  }, [cakeAndPastryItems]);

  // Filter items based on search term and category
  const filteredItems = useMemo(() => {
    const activeItems = cakeAndPastryItems.filter(item => item.status !== 'inactive');
    return activeItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (item.barcode && item.barcode.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [cakeAndPastryItems, searchTerm, categoryFilter]);

  // Compute stats for current date and outlet
  const dailyStats = useMemo(() => {
    const activeItems = cakeAndPastryItems.filter(i => i.status !== 'inactive');
    const totalCount = activeItems.length;
    let completedCount = 0;
    let totalSalesQty = 0;

    activeItems.forEach(item => {
      const itemData = records[currentDate]?.[selectedOutletId]?.[item.id];
      if (itemData && itemData.closing !== undefined && itemData.closing !== null && itemData.calculationMode === 'closing') {
        completedCount++;
        totalSalesQty += Number(itemData.sold || 0);
      }
    });

    return {
      totalCount,
      completedCount,
      pendingCount: totalCount - completedCount,
      totalSalesQty,
      completionRate: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
    };
  }, [cakeAndPastryItems, records, currentDate, selectedOutletId]);

  // Compile closing stock history logs for this outlet
  const closingHistory = useMemo(() => {
    const historyList: Array<{
      date: string;
      totalItems: number;
      completedItems: number;
      totalSalesQty: number;
      completionRate: number;
    }> = [];

    const sortedDates = Object.keys(records).sort((a, b) => b.localeCompare(a));
    const activeItemsCount = cakeAndPastryItems.filter(it => it.status !== 'inactive').length;

    sortedDates.forEach(dateStr => {
      const outletRecs = records[dateStr]?.[selectedOutletId] || {};
      const itemIds = Object.keys(outletRecs);
      if (itemIds.length === 0) return;

      let completed = 0;
      let totalSales = 0;

      itemIds.forEach(id => {
        const data = outletRecs[id];
        const itemObj = cakeAndPastryItems.find(it => it.id === id);
        if (itemObj && itemObj.status !== 'inactive' && data && data.closing !== undefined && data.closing !== null && data.calculationMode === 'closing') {
          completed++;
          totalSales += Number(data.sold || 0);
        }
      });

      if (completed > 0) {
        historyList.push({
          date: dateStr,
          totalItems: activeItemsCount,
          completedItems: completed,
          totalSalesQty: totalSales,
          completionRate: activeItemsCount > 0 ? Math.round((completed / activeItemsCount) * 100) : 0
        });
      }
    });

    return historyList;
  }, [records, selectedOutletId, cakeAndPastryItems]);

  // Format date for display (e.g. "Sunday, 12 July 2026")
  const formatDateLabel = (dateStr: string) => {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return format(d, 'EEEE, dd MMMM yyyy');
      }
    } catch (e) {}
    return dateStr;
  };

  // Generate the 5 active dates ending on the selected currentDate
  const activeDates = useMemo(() => {
    try {
      const [y, m, d] = currentDate.split('-').map(Number);
      const dates: Array<{ dateStr: string; dayLabel: string }> = [];
      for (let i = 4; i >= 0; i--) {
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() - i);
        const py = dt.getFullYear();
        const pm = String(dt.getMonth() + 1).padStart(2, '0');
        const pd = String(dt.getDate()).padStart(2, '0');
        const dStr = `${py}-${pm}-${pd}`;
        dates.push({
          dateStr: dStr,
          dayLabel: format(dt, 'dd-MMM')
        });
      }
      return dates;
    } catch (e) {
      try {
        const parts = currentDate.split('-');
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return [{ dateStr: currentDate, dayLabel: format(d, 'dd-MMM') }];
      } catch (err) {
        return [{ dateStr: currentDate, dayLabel: currentDate }];
      }
    }
  }, [currentDate]);

  // Get data fields for a row
  const getRowData = useCallback((itemId: string) => {
    const rawData = records[currentDate]?.[selectedOutletId]?.[itemId] || {};
    
    // Auto-fetch opening stock from previous day's closing
    const opening = Number(rawData.opening ?? getPreviousClosingInternal(records, itemId, currentDate, selectedOutletId) ?? 0);
    const received = Number(rawData.received ?? 0);
    const transf_in = Number(rawData.transf_in ?? 0);
    const testing = Number(rawData.testing ?? 0);
    const wastage = Number(rawData.wastage ?? 0);
    const returned = Number(rawData.returned ?? 0);
    const transf_out = Number(rawData.transf_out ?? 0);
    const closing = rawData.closing !== undefined ? Number(rawData.closing) : undefined;
    const manufactureClosing = rawData.manufactureClosing || {};
    
    const inward = received + transf_in;
    const adjustments = testing + wastage + returned + transf_out;
    const isClosingMode = rawData.calculationMode === 'closing';

    // Sold calculation in real-time
    let calculatedSold = 0;
    if (closing !== undefined) {
      calculatedSold = (opening + inward) - (adjustments + closing);
    }

    return {
      opening,
      inward,
      adjustments,
      closing,
      manufactureClosing,
      sold: isClosingMode ? (rawData.sold ?? calculatedSold) : calculatedSold,
      isClosingMode,
      rawData
    };
  }, [records, currentDate, selectedOutletId, getPreviousClosingInternal]);

  // Handle cell edit and save for a specific manufacture date
  const handleManufactureEdit = async (itemId: string, targetDateStr: string, newValStr: string) => {
    const trimmed = newValStr.trim();
    const newVal = trimmed === '' ? 0 : Number(trimmed.replace(/[^0-9]/g, ''));
    if (isNaN(newVal)) return;

    const cellKey = `${currentDate}_${itemId}_${targetDateStr}`;
    setSaveStatus(prev => ({ ...prev, [cellKey]: 'saving' }));

    const rowData = getRowData(itemId);
    
    // Compute new manufacture closing object
    const existingManufactureClosing = { ...(rowData.rawData.manufactureClosing || {}) };
    existingManufactureClosing[targetDateStr] = newVal;

    // Sum the counts of only the 5 active dates
    const newTotalClosing = activeDates.reduce((sum, d) => sum + Number(existingManufactureClosing[d.dateStr] ?? 0), 0);
    const calculatedSold = (rowData.opening + rowData.inward) - (rowData.adjustments + newTotalClosing);

    // 1. Update React local state immediately for fast feedback
    setRecords((prev: any) => {
      const nextRecords = { ...prev };
      if (!nextRecords[currentDate]) nextRecords[currentDate] = {};
      if (!nextRecords[currentDate][selectedOutletId]) nextRecords[currentDate][selectedOutletId] = {};
      
      const existingItem = nextRecords[currentDate][selectedOutletId][itemId] || {};

      nextRecords[currentDate][selectedOutletId][itemId] = {
        ...existingItem,
        opening: rowData.opening,
        received: existingItem.received || 0,
        transf_in: existingItem.transf_in || 0,
        testing: existingItem.testing || 0,
        wastage: existingItem.wastage || 0,
        returned: existingItem.returned || 0,
        transf_out: existingItem.transf_out || 0,
        manufactureClosing: existingManufactureClosing,
        closing: newTotalClosing,
        sold: calculatedSold,
        calculationMode: 'closing'
      };
      
      localStorage.setItem('broomies_db_daily_records_v2', JSON.stringify(nextRecords));
      return nextRecords;
    });

    // 2. Persist to Firestore
    try {
      const docId = `${currentDate}_${selectedOutletId}`;
      const docRef = doc(db, DAILY_RECORDS_COL, docId);

      const dayData = records[currentDate] || {};
      const outletData = dayData[selectedOutletId] || {};
      const existingItem = outletData[itemId] || {};

      const updatedRecords = {
        ...outletData,
        [itemId]: {
          ...existingItem,
          opening: rowData.opening,
          received: existingItem.received || 0,
          transf_in: existingItem.transf_in || 0,
          testing: existingItem.testing || 0,
          wastage: existingItem.wastage || 0,
          returned: existingItem.returned || 0,
          transf_out: existingItem.transf_out || 0,
          manufactureClosing: existingManufactureClosing,
          closing: newTotalClosing,
          sold: calculatedSold,
          calculationMode: 'closing'
        }
      };

      await setDoc(docRef, {
        date: currentDate,
        outletId: selectedOutletId,
        records: updatedRecords,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setSaveStatus(prev => ({ ...prev, [cellKey]: 'saved' }));
      setTimeout(() => {
        setSaveStatus(prev => {
          const next = { ...prev };
          delete next[cellKey];
          return next;
        });
      }, 1500);
    } catch (e) {
      console.error("Error saving daily closing stock to Firestore:", e);
      setSaveStatus(prev => ({ ...prev, [cellKey]: 'error' }));
      handleFirestoreError(e, OperationType.WRITE, `${DAILY_RECORDS_COL}/${currentDate}_${selectedOutletId}`);
    }
  };

  // Keyboard "Enter" navigator for 2D inputs
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      // Find the input element on the next row, same column
      const nextInput = document.querySelector(`input[data-row-idx="${rowIndex + 1}"][data-col-idx="${colIndex}"]`) as HTMLInputElement;
      if (nextInput) {
        nextInput.focus();
        try {
          nextInput.select();
        } catch (err) {}
        nextInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } else {
        // Wrap around to first row if it reaches end
        const firstInput = document.querySelector(`input[data-row-idx="0"][data-col-idx="${colIndex}"]`) as HTMLInputElement;
        if (firstInput) {
          firstInput.focus();
          try {
            firstInput.select();
          } catch (err) {}
          firstInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-y-auto">
      {/* Header Bar */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between p-6 bg-white border-b border-stone-200 gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 bg-brand-text text-white flex items-center justify-center rounded-lg shadow-sm">
              <Clock size={20} />
            </span>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-brand-text uppercase">
                Outlet Closing Entry
              </h1>
              <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider mt-0.5">
                Daily physical closing stock counts & sales audits for {outletName}
              </p>
            </div>
          </div>
        </div>

        {/* Filters and Date Navigation */}
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          {/* Active Tab Toggle */}
          <div className="flex border-2 border-brand-text bg-stone-100 p-0.5 rounded-lg">
            <button 
              onClick={() => setActiveTab('entry')}
              className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'entry' ? 'bg-brand-text text-white shadow-sm' : 'text-stone-600 hover:text-brand-text'}`}
            >
              <FileSpreadsheet size={13} />
              Daily Entry
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'history' ? 'bg-brand-text text-white shadow-sm' : 'text-stone-600 hover:text-brand-text'}`}
            >
              <History size={13} />
              Closing Logs ({closingHistory.length})
            </button>
          </div>

          {/* Date Selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-stone-200 rounded-lg shadow-sm">
            <Calendar size={14} className="text-brand-text" />
            <span className="text-[9px] font-black text-stone-500 uppercase">CLOSING DATE:</span>
            <input 
              type="date" 
              value={currentDate} 
              onChange={(e) => setCurrentDate(e.target.value)}
              className="text-xs font-extrabold text-brand-text bg-transparent border-none p-0 focus:outline-none focus:ring-0"
            />
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 p-6 flex flex-col gap-6">
        
        {/* KPI Cards (Only show on Entry tab) */}
        {activeTab === 'entry' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 border-2 border-stone-200 rounded-xl flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Active Catalog Items</span>
                <h3 className="text-2xl font-black text-brand-text mt-1">{dailyStats.totalCount}</h3>
              </div>
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                <Layers size={18} />
              </div>
            </div>

            <div className="bg-white p-5 border-2 border-stone-200 rounded-xl flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest font-black">Completed Entries</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <h3 className="text-2xl font-black text-emerald-700">{dailyStats.completedCount}</h3>
                  <span className="text-xs text-stone-400 font-bold">/ {dailyStats.totalCount}</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                <CheckCircle2 size={18} />
              </div>
            </div>

            <div className="bg-white p-5 border-2 border-stone-200 rounded-xl flex items-center justify-between shadow-sm">
              <div>
                <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest font-black">Pending Items</span>
                <h3 className={`text-2xl font-black mt-1 ${dailyStats.pendingCount > 0 ? 'text-amber-600' : 'text-stone-400'}`}>
                  {dailyStats.pendingCount}
                </h3>
              </div>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${dailyStats.pendingCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                <AlertCircle size={18} />
              </div>
            </div>

            <div className="bg-white p-5 border-2 border-stone-200 rounded-xl flex items-center justify-between shadow-sm bg-gradient-to-br from-white to-emerald-50/20">
              <div>
                <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest font-black">Estimated Daily Sales</span>
                <h3 className="text-2xl font-black text-brand-text mt-1">{dailyStats.totalSalesQty} pcs</h3>
              </div>
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                <TrendingUp size={18} />
              </div>
            </div>
          </div>
        )}

        {/* Tab View Contents */}
        <AnimatePresence mode="wait">
          {activeTab === 'entry' ? (
            <motion.div 
              key="entry-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="bg-white border-2 border-stone-200 rounded-xl overflow-hidden shadow-sm flex flex-col flex-1"
            >
              {/* Table Search & Category Filter Section */}
              <div className="p-4 bg-stone-50 border-b border-stone-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Category Filter Pills */}
                  <div className="flex items-center gap-1.5 bg-white p-1 rounded-lg border border-stone-200 overflow-x-auto max-w-full">
                    <span className="text-[9px] font-black text-stone-400 uppercase px-2">Category:</span>
                    {categories.slice(0, 6).map(cat => (
                      <button
                        key={cat}
                        onClick={() => setCategoryFilter(cat)}
                        className={`px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-wider transition-all ${categoryFilter === cat ? 'bg-brand-text text-white shadow-sm' : 'text-stone-600 hover:bg-stone-100'}`}
                      >
                        {cat}
                      </button>
                    ))}
                    {categories.length > 6 && (
                      <select 
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                        className="text-[9px] font-black uppercase text-stone-600 bg-transparent border-none py-1 pl-2 pr-6 focus:outline-none focus:ring-0"
                      >
                        <option value="all">More...</option>
                        {categories.slice(6).map(cat => (
                          <option key={cat} value={cat}>{cat.toUpperCase()}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="relative shrink-0 w-full md:w-72">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search item or barcode..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-1.5 bg-white border border-stone-200 rounded-lg text-xs w-full focus:outline-none focus:border-brand-text focus:ring-1 focus:ring-brand-text font-semibold shadow-sm text-stone-700"
                  />
                </div>
              </div>

              {/* Status banner */}
              <div className="bg-[#FAF9F5] px-6 py-3 border-b border-stone-200 flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2 text-xs font-bold text-stone-600 uppercase">
                  <Database size={14} className="text-brand-text" />
                  <span>Showing closing stock table for <span className="text-[#4F2C1D] underline">{formatDateLabel(currentDate)}</span></span>
                </div>
                <div className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                  ⌨️ TIP: PRESS <kbd className="px-1.5 py-0.5 bg-stone-200 border border-stone-300 rounded text-[9px] text-stone-700 font-mono">ENTER</kbd> TO GO TO NEXT ROW INSTANTLY
                </div>
              </div>

              {/* Items Table */}
              <div className="overflow-x-auto flex-1">
                <table ref={tableRef} className="w-full text-left border-collapse table-auto text-xs min-w-max">
                  <thead>
                    {/* Row 1 */}
                    <tr className="bg-[#4F2C1D] text-white uppercase text-[9px] tracking-wider divide-x divide-white/5 font-black">
                      <th className="p-4 text-center w-12 sticky left-0 z-10 bg-[#4F2C1D]" rowSpan={2}>S.No</th>
                      <th className="p-4 w-80 sticky left-12 z-10 bg-[#4F2C1D]" style={{ minWidth: '320px' }}>ITEMS</th>
                      <th className="p-2 text-center bg-[#B4C6E7] text-[#1F4E78] font-black text-xs italic tracking-wider uppercase border-b border-white/20" colSpan={5}>
                        {outletName}
                      </th>
                      <th className="p-4 w-32 text-center bg-[#462619] border-x border-stone-800" rowSpan={2}>Total Closing</th>
                      <th className="p-4 text-center w-24" rowSpan={2}>Status</th>
                    </tr>
                    {/* Row 2 */}
                    <tr className="bg-[#4F2C1D] text-white uppercase text-[9px] tracking-wider divide-x divide-white/5 font-black">
                      <th className="p-2 w-80 sticky left-12 z-10 bg-[#D46A43] text-white text-left font-extrabold" style={{ minWidth: '320px' }}>
                        Manufacture date:-
                      </th>
                      {activeDates.map((d, colIdx) => (
                        <th 
                          key={d.dateStr} 
                          className="p-2 w-24 text-center bg-[#8EA9DB] text-white font-black text-xs border border-white/10"
                          title={formatDateLabel(d.dateStr)}
                        >
                          {d.dayLabel}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-medium">
                    {filteredItems.map((item, idx) => {
                      const rowData = getRowData(item.id);
                      
                      const isAnySaving = activeDates.some(d => saveStatus[`${currentDate}_${item.id}_${d.dateStr}`] === 'saving');
                      const isAnyError = activeDates.some(d => saveStatus[`${currentDate}_${item.id}_${d.dateStr}`] === 'error');
                      const isAnySaved = activeDates.some(d => saveStatus[`${currentDate}_${item.id}_${d.dateStr}`] === 'saved');
                      const status = isAnySaving ? 'saving' : isAnyError ? 'error' : isAnySaved ? 'saved' : 'idle';

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors uppercase divide-x divide-stone-100">
                          {/* S.No */}
                          <td className="p-4 text-center bg-stone-50 font-mono text-stone-400 w-12 sticky left-0 z-10">{idx + 1}</td>
                          
                          {/* Item Details */}
                          <td className="p-4 w-80 sticky left-12 bg-white z-10">
                            <div>
                              <p className="font-extrabold text-brand-text text-xs leading-tight tracking-tight">{item.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[8px] bg-stone-100 border border-stone-200 text-stone-600 px-1.5 py-0.5 font-bold rounded">
                                  {item.category}
                                </span>
                                {item.barcode && (
                                  <span className="text-[8px] font-mono text-stone-400 font-bold">
                                    {item.barcode}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Manufacture-wise Closing Inputs */}
                          {activeDates.map((d, colIdx) => {
                            const cellKey = `${currentDate}_${item.id}_${d.dateStr}`;
                            const subStatus = saveStatus[cellKey] || 'idle';
                            const mVal = rowData.manufactureClosing[d.dateStr];

                            return (
                              <td key={d.dateStr} className="p-2 text-center bg-[#D9E1F2]/10 w-24 border-x border-stone-100">
                                <div className="flex flex-col items-center justify-center gap-1">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    data-row-idx={idx}
                                    data-col-idx={colIdx}
                                    defaultValue={mVal === undefined ? '' : String(mVal)}
                                    key={`${cellKey}_${mVal ?? 'none'}`}
                                    onBlur={(e) => handleManufactureEdit(item.id, d.dateStr, e.target.value)}
                                    onKeyDown={(e) => handleInputKeyDown(e, idx, colIdx)}
                                    placeholder="0"
                                    className={`w-16 h-8 text-center font-bold font-mono text-xs rounded border transition-all ${
                                      mVal !== undefined && mVal > 0 
                                        ? 'bg-blue-50 border-blue-400 text-blue-900 font-extrabold shadow-sm' 
                                        : 'bg-white border-stone-200 text-stone-800 hover:border-stone-300 focus:border-[#8EA9DB] focus:ring-1 focus:ring-[#8EA9DB]/30'
                                    }`}
                                  />
                                  {subStatus === 'saving' && (
                                    <span className="text-[7px] font-bold text-amber-500 animate-pulse uppercase">Saving</span>
                                  )}
                                  {subStatus === 'error' && (
                                    <span className="text-[7px] font-bold text-rose-500 uppercase">Err</span>
                                  )}
                                </div>
                              </td>
                            );
                          })}

                          {/* Total Closing Count Display */}
                          <td className="p-4 text-center font-mono text-brand-text text-xs font-black bg-stone-50/40 w-32 border-x border-stone-200">
                            {activeDates.reduce((sum, d) => sum + Number(rowData.manufactureClosing[d.dateStr] ?? 0), 0)} pcs
                          </td>

                          {/* Save Status */}
                          <td className="p-4 text-center w-24">
                            <div className="flex items-center justify-center">
                              {status === 'saving' && (
                                <div className="flex items-center gap-1">
                                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                                  <span className="text-[8px] font-black text-amber-600 uppercase">Saving</span>
                                </div>
                              )}
                              {status === 'saved' && (
                                <div className="flex items-center gap-1 text-emerald-600">
                                  <Check size={12} className="stroke-[3]" />
                                  <span className="text-[8px] font-black uppercase">Saved</span>
                                </div>
                              )}
                              {status === 'error' && (
                                <div className="flex items-center gap-1 text-red-600" title="Click to retry">
                                  <AlertCircle size={12} />
                                  <span className="text-[8px] font-black uppercase">Failed</span>
                                </div>
                              )}
                              {status === 'idle' && rowData.closing !== undefined && (
                                <span className="text-[8px] font-black text-emerald-600 uppercase bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                                  Synced
                                </span>
                              )}
                              {status === 'idle' && rowData.closing === undefined && (
                                <span className="w-1.5 h-1.5 rounded-full bg-stone-300" />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredItems.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-16 text-center font-bold text-stone-400 uppercase tracking-wider bg-stone-50/50">
                          No matching catalog items found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="history-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="bg-white border-2 border-stone-200 rounded-xl overflow-hidden shadow-sm flex flex-col p-6 gap-6"
            >
              <div>
                <h3 className="font-extrabold text-brand-text text-sm uppercase tracking-wider">
                  Closing Entry Submission Logs
                </h3>
                <p className="text-xs text-stone-500 uppercase font-bold tracking-wide mt-1">
                  History of daily physical closing counts submitted by {outletName} staff
                </p>
              </div>

              {closingHistory.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {closingHistory.map(hist => (
                    <div 
                      key={hist.date} 
                      className={`border-2 rounded-xl p-5 bg-white shadow-sm flex flex-col justify-between transition-all hover:border-brand-text group relative overflow-hidden ${currentDate === hist.date ? 'border-brand-text ring-2 ring-brand-text/10' : 'border-stone-200'}`}
                    >
                      {currentDate === hist.date && (
                        <div className="absolute top-0 right-0 bg-brand-text text-white px-3 py-1 rounded-bl-lg text-[8px] font-black uppercase tracking-wider">
                          Currently Active
                        </div>
                      )}

                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="p-1.5 bg-brand-text/5 text-brand-text rounded-md">
                            <Calendar size={16} />
                          </span>
                          <span className="font-extrabold text-stone-800 text-sm">
                            {formatDateLabel(hist.date)}
                          </span>
                        </div>

                        {/* Completion rate bar */}
                        <div className="mt-4">
                          <div className="flex justify-between items-center text-[10px] font-black uppercase text-stone-500 mb-1.5">
                            <span>COMPLETION RATE</span>
                            <span className={hist.completionRate === 100 ? 'text-emerald-600' : 'text-amber-600'}>
                              {hist.completionRate}% ({hist.completedItems}/{hist.totalItems})
                            </span>
                          </div>
                          <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-500 ${hist.completionRate === 100 ? 'bg-emerald-600' : 'bg-amber-500'}`} 
                              style={{ width: `${hist.completionRate}%` }}
                            />
                          </div>
                        </div>

                        {/* Estimated daily sales */}
                        <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
                          <span className="text-[10px] font-black text-stone-400 uppercase">Estimated Sales Count</span>
                          <span className="text-xs font-black font-mono text-stone-800">{hist.totalSalesQty} pcs</span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setCurrentDate(hist.date);
                          setActiveTab('entry');
                        }}
                        className="mt-6 w-full h-10 border-2 border-brand-text rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-brand-text hover:text-white transition-colors"
                      >
                        Load Daily Sheet <ArrowRight size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border-4 border-dashed border-stone-200 bg-stone-50/50 p-16 rounded-xl text-center flex flex-col items-center justify-center space-y-4">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-stone-400 border-2 border-stone-100 shadow-sm">
                    <History size={24} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-brand-text text-sm uppercase tracking-wider">No Submissions Recorded Yet</h4>
                    <p className="text-xs text-stone-400 font-bold uppercase tracking-wider mt-1 max-w-xs mx-auto">
                      Start typing physical closing values in the table to record your first daily submission log!
                    </p>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});

DateWiseClosingComponent.displayName = 'DateWiseClosingComponent';
