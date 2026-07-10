import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowRightLeft,
  Calendar, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  RefreshCw,
  SlidersHorizontal,
  TrendingDown,
  Activity,
  Check,
  Building,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db, DAILY_RECORDS_COL } from '../lib/firebase';
import { OUTLETS } from './LedgerSheetComponent';

interface StockComparisonProps {
  items: any[];
  records: any;
  setRecords: React.Dispatch<React.SetStateAction<any>>;
  currentDate: string;
  setCurrentDate: (date: string) => void;
  setIsSidebarOpen: (open: boolean) => void;
  getPreviousClosingInternal?: (allRecords: any, itemId: string, date: string, outletId: string) => number;
}

export const StockComparisonComponent = React.memo(({
  items,
  records,
  setRecords,
  currentDate,
  setCurrentDate,
  setIsSidebarOpen,
  getPreviousClosingInternal
}: StockComparisonProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOutletId, setSelectedOutletId] = useState('31');
  const [activeTab, setActiveTab] = useState<'discrepancies' | 'all'>('discrepancies');
  const [reconcilingItemId, setReconcilingItemId] = useState<string | null>(null);
  const [customValue, setCustomValue] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<{ [key: string]: 'idle' | 'saving' | 'saved' | 'error' }>({});

  // Clean outlets list
  const outletsToCompare = useMemo(() => {
    return OUTLETS.filter(o => o.id !== 'bk'); // Compare retail outlets (can include bk if needed)
  }, []);

  const selectedOutletName = useMemo(() => {
    return OUTLETS.find(o => o.id === selectedOutletId)?.name || `Outlet ${selectedOutletId}`;
  }, [selectedOutletId]);

  // Compute 4 days ending at currentDate for easy reference in case they want historical date comparison
  const lastActiveDate = currentDate;

  // Active items from catalog
  const activeItems = useMemo(() => {
    return items.filter((i: any) => i.status !== 'inactive');
  }, [items]);

  // Helper to safely get previous day's closing stock as today's opening stock
  const getPreviousClosingStock = (itemId: string, dateStr: string, outletId: string): number => {
    if (getPreviousClosingInternal) {
      return getPreviousClosingInternal(records, itemId, dateStr, outletId);
    }
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const prevDateObj = new Date(year, month - 1, day);
      prevDateObj.setDate(prevDateObj.getDate() - 1);
      
      const pY = prevDateObj.getFullYear();
      const pM = String(prevDateObj.getMonth() + 1).padStart(2, '0');
      const pD = String(prevDateObj.getDate()).padStart(2, '0');
      const prevDateStr = `${pY}-${pM}-${pD}`;

      return Number(records[prevDateStr]?.[outletId]?.[itemId]?.closing ?? 0);
    } catch (e) {
      return 0;
    }
  };

  // Build the comparison data structure for selected date and outlet
  const comparisonData = useMemo(() => {
    const dayData = records[lastActiveDate] || {};
    
    return activeItems.map((item) => {
      const outletRecord = dayData[selectedOutletId]?.[item.id] || {
        opening: 0,
        received: 0,
        transf_in: 0,
        sold: 0,
        testing: 0,
        returned: 0,
        transf_out: 0,
        closing: 0,
        calculationMode: 'sold'
      };

      // Safely parse values
      const opening = Number(outletRecord.opening || getPreviousClosingStock(item.id, lastActiveDate, selectedOutletId));
      const received = Number(outletRecord.received || 0);
      const transf_in = Number(outletRecord.transf_in || 0);
      const sold = Number(outletRecord.sold || 0);
      const testing = Number(outletRecord.testing || 0);
      const returned = Number(outletRecord.returned || 0);
      const transf_out = Number(outletRecord.transf_out || 0);
      const physicalClosing = Number(outletRecord.closing || 0);

      // Expected/Theoretical Closing based on transactional logs
      const expectedClosing = opening + received + transf_in - sold - testing - returned - transf_out;
      const difference = physicalClosing - expectedClosing;

      return {
        item,
        opening,
        received,
        transf_in,
        sold,
        testing,
        returned,
        transf_out,
        expectedClosing,
        physicalClosing,
        difference,
        calculationMode: outletRecord.calculationMode || 'sold',
        originalRecord: outletRecord
      };
    });
  }, [activeItems, records, lastActiveDate, selectedOutletId]);

  // General summary statistics across ALL retail outlets for the selected date
  const summaryStats = useMemo(() => {
    let totalItemsChecked = 0;
    let totalMismatches = 0;
    let totalShortage = 0;
    let totalSurplus = 0;

    const outletMismatches: { [outletId: string]: number } = {};
    outletsToCompare.forEach(o => {
      outletMismatches[o.id] = 0;
    });

    const dayData = records[lastActiveDate] || {};

    activeItems.forEach(item => {
      outletsToCompare.forEach(outlet => {
        const outletRecord = dayData[outlet.id]?.[item.id] || {};
        const opening = Number(outletRecord.opening || getPreviousClosingStock(item.id, lastActiveDate, outlet.id));
        const received = Number(outletRecord.received || 0);
        const transf_in = Number(outletRecord.transf_in || 0);
        const sold = Number(outletRecord.sold || 0);
        const testing = Number(outletRecord.testing || 0);
        const returned = Number(outletRecord.returned || 0);
        const transf_out = Number(outletRecord.transf_out || 0);
        const physicalClosing = Number(outletRecord.closing || 0);

        const expectedClosing = opening + received + transf_in - sold - testing - returned - transf_out;
        const difference = physicalClosing - expectedClosing;

        totalItemsChecked++;
        if (difference !== 0) {
          totalMismatches++;
          outletMismatches[outlet.id] = (outletMismatches[outlet.id] || 0) + 1;
          if (difference < 0) {
            totalShortage += Math.abs(difference);
          } else {
            totalSurplus += difference;
          }
        }
      });
    });

    return {
      totalItemsChecked,
      totalMismatches,
      totalShortage,
      totalSurplus,
      outletMismatches
    };
  }, [activeItems, records, lastActiveDate, outletsToCompare]);

  // Filter comparison items
  const filteredComparison = useMemo(() => {
    return comparisonData.filter(row => {
      const matchSearch = row.item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          row.item.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (!matchSearch) return false;
      if (activeTab === 'discrepancies') {
        return row.difference !== 0;
      }
      return true;
    }).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)); // Show largest differences first
  }, [comparisonData, searchTerm, activeTab]);

  // Handle direct value update and sync to Firestore
  const handleUpdateField = async (itemId: string, field: 'closing' | 'sold', newValue: number) => {
    const key = `${itemId}_${field}`;
    setSaveStatus(prev => ({ ...prev, [key]: 'saving' }));

    // 1. Update React Local state
    setRecords((prev: any) => {
      const nextRecords = { ...prev };
      if (!nextRecords[lastActiveDate]) nextRecords[lastActiveDate] = {};
      if (!nextRecords[lastActiveDate][selectedOutletId]) nextRecords[lastActiveDate][selectedOutletId] = {};

      const existingItem = nextRecords[lastActiveDate][selectedOutletId][itemId] || {
        opening: 0, received: 0, sold: 0, testing: 0, returned: 0, wastage: 0, transf_out: 0, closing: 0, calculationMode: 'sold'
      };

      // Recalculate based on updating field
      const updatedItem = {
        ...existingItem,
        [field]: newValue
      };

      // Set calculationMode appropriately to keep balance clean
      if (field === 'closing') {
        updatedItem.calculationMode = 'closing';
        // Auto-compute sold based on physical closing
        const opening = Number(updatedItem.opening || getPreviousClosingStock(itemId, lastActiveDate, selectedOutletId));
        const received = Number(updatedItem.received || 0);
        const transf_in = Number(updatedItem.transf_in || 0);
        const testing = Number(updatedItem.testing || 0);
        const returned = Number(updatedItem.returned || 0);
        const transf_out = Number(updatedItem.transf_out || 0);
        updatedItem.sold = (opening + received + transf_in) - (testing + returned + transf_out + newValue);
      } else {
        updatedItem.calculationMode = 'sold';
        // Auto-compute closing based on sold sales
        const opening = Number(updatedItem.opening || getPreviousClosingStock(itemId, lastActiveDate, selectedOutletId));
        const received = Number(updatedItem.received || 0);
        const transf_in = Number(updatedItem.transf_in || 0);
        const testing = Number(updatedItem.testing || 0);
        const returned = Number(updatedItem.returned || 0);
        const transf_out = Number(updatedItem.transf_out || 0);
        updatedItem.closing = opening + received + transf_in - newValue - testing - returned - transf_out;
      }

      nextRecords[lastActiveDate][selectedOutletId][itemId] = updatedItem;
      localStorage.setItem('broomies_db_daily_records_v2', JSON.stringify(nextRecords));
      return nextRecords;
    });

    // 2. Write to Firestore
    try {
      const docId = `${lastActiveDate}_${selectedOutletId}`;
      const docRef = doc(db, DAILY_RECORDS_COL, docId);

      const dayData = records[lastActiveDate] || {};
      const outletData = dayData[selectedOutletId] || {};
      const existingItem = outletData[itemId] || {
        opening: 0, received: 0, sold: 0, testing: 0, returned: 0, wastage: 0, transf_out: 0, closing: 0, calculationMode: 'sold'
      };

      const updatedItem = {
        ...existingItem,
        [field]: newValue
      };

      if (field === 'closing') {
        updatedItem.calculationMode = 'closing';
        const opening = Number(updatedItem.opening || getPreviousClosingStock(itemId, lastActiveDate, selectedOutletId));
        const received = Number(updatedItem.received || 0);
        const transf_in = Number(updatedItem.transf_in || 0);
        const testing = Number(updatedItem.testing || 0);
        const returned = Number(updatedItem.returned || 0);
        const transf_out = Number(updatedItem.transf_out || 0);
        updatedItem.sold = (opening + received + transf_in) - (testing + returned + transf_out + newValue);
      } else {
        updatedItem.calculationMode = 'sold';
        const opening = Number(updatedItem.opening || getPreviousClosingStock(itemId, lastActiveDate, selectedOutletId));
        const received = Number(updatedItem.received || 0);
        const transf_in = Number(updatedItem.transf_in || 0);
        const testing = Number(updatedItem.testing || 0);
        const returned = Number(updatedItem.returned || 0);
        const transf_out = Number(updatedItem.transf_out || 0);
        updatedItem.closing = opening + received + transf_in - newValue - testing - returned - transf_out;
      }

      const updatedRecords = {
        ...outletData,
        [itemId]: updatedItem
      };

      await setDoc(docRef, {
        date: lastActiveDate,
        outletId: selectedOutletId,
        records: updatedRecords,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setSaveStatus(prev => ({ ...prev, [key]: 'saved' }));
      setTimeout(() => {
        setSaveStatus(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }, 1500);
      setReconcilingItemId(null);
      setCustomValue('');
    } catch (e) {
      console.error("Failed to reconcile/update cell:", e);
      setSaveStatus(prev => ({ ...prev, [key]: 'error' }));
    }
  };

  // Reconcile Option A: Accept Physical Closing (Adjust sales automatically to fit)
  const handleAcceptPhysicalClosing = (itemId: string, physicalClosing: number) => {
    handleUpdateField(itemId, 'closing', physicalClosing);
  };

  // Reconcile Option B: Reset Closing to match expected System Stock
  const handleSetClosingToExpected = (itemId: string, expectedClosing: number) => {
    handleUpdateField(itemId, 'closing', Math.max(0, expectedClosing));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAF9F5] overflow-y-auto">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between p-6 bg-white border-b border-stone-200 shadow-sm gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#4F2C1D] text-white rounded">
              <ArrowRightLeft size={20} />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-[#4F2C1D] uppercase">Stock Compare & Reconciliation</h1>
          </div>
          <p className="text-xs text-stone-500 mt-1 uppercase tracking-wider font-semibold">
            Audit discrepancy sheet comparing physical closing entries with system transactional logs
          </p>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-3 bg-[#FAF8F5] p-2 border border-stone-200 rounded-lg shadow-sm">
          <Calendar size={15} className="text-[#4F2C1D]" />
          <span className="text-xs font-bold text-stone-600 uppercase">Target Date:</span>
          <input 
            type="date" 
            value={currentDate} 
            onChange={(e) => setCurrentDate(e.target.value)}
            className="text-xs bg-white text-[#4F2C1D] border border-stone-300 font-extrabold px-2 py-1 rounded focus:outline-none shadow-sm"
          />
        </div>
      </div>

      {/* Global Summary Statistics Widget */}
      <div className="p-6 pb-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Total Discrepancies</span>
            <h3 className="text-2xl font-black text-[#4F2C1D] font-mono mt-1">
              {summaryStats.totalMismatches} <span className="text-xs font-normal text-stone-400">items</span>
            </h3>
          </div>
          <span className={`p-3 rounded-full ${summaryStats.totalMismatches > 0 ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-emerald-50 text-emerald-600'}`}>
            <AlertTriangle size={24} />
          </span>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Total Shortages</span>
            <h3 className="text-2xl font-black text-red-600 font-mono mt-1">
              -{summaryStats.totalShortage} <span className="text-xs font-normal text-stone-400">units</span>
            </h3>
          </div>
          <span className="p-3 bg-red-50 text-red-600 rounded-full">
            <TrendingDown size={24} />
          </span>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Total Surplus (Excess)</span>
            <h3 className="text-2xl font-black text-amber-600 font-mono mt-1">
              +{summaryStats.totalSurplus} <span className="text-xs font-normal text-stone-400">units</span>
            </h3>
          </div>
          <span className="p-3 bg-amber-50 text-amber-600 rounded-full">
            <Activity size={24} />
          </span>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Global Audit Match Rate</span>
            <h3 className="text-2xl font-black text-emerald-600 font-mono mt-1">
              {summaryStats.totalItemsChecked > 0 
                ? `${Math.round(((summaryStats.totalItemsChecked - summaryStats.totalMismatches) / summaryStats.totalItemsChecked) * 100)}%`
                : '100%'
              }
            </h3>
          </div>
          <span className="p-3 bg-emerald-50 text-emerald-600 rounded-full">
            <CheckCircle2 size={24} />
          </span>
        </div>
      </div>

      {/* Outlet Audit Summary Badges */}
      <div className="px-6 pt-4 shrink-0">
        <div className="bg-stone-100/80 border border-stone-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Building size={16} className="text-stone-500" />
            <span className="text-[10px] font-extrabold text-stone-600 uppercase">Outlet Discrepancy Overview:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {outletsToCompare.map(outlet => {
              const mismatches = summaryStats.outletMismatches[outlet.id] || 0;
              return (
                <button
                  key={outlet.id}
                  onClick={() => setSelectedOutletId(outlet.id)}
                  className={`px-3 py-1.5 border flex items-center gap-2 text-[10px] font-bold uppercase transition-all duration-200 ${
                    selectedOutletId === outlet.id
                      ? 'bg-[#4F2C1D] border-[#4F2C1D] text-white shadow'
                      : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <span>{outlet.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${
                    mismatches > 0 
                      ? selectedOutletId === outlet.id ? 'bg-white text-[#4F2C1D]' : 'bg-[#4F2C1D]/10 text-[#4F2C1D]' 
                      : selectedOutletId === outlet.id ? 'bg-white text-emerald-800' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {mismatches > 0 ? `${mismatches} Diff` : 'Match ✓'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detail Comparative Sheet */}
      <div className="flex-1 p-6">
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-md flex flex-col h-full">
          {/* Controls Bar */}
          <div className="p-4 bg-[#FAF9F5] border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
            {/* View Filter Tab Buttons */}
            <div className="flex border border-stone-200 rounded-lg overflow-hidden bg-white shadow-sm p-0.5">
              <button
                onClick={() => setActiveTab('discrepancies')}
                className={`px-4 py-1.5 text-xs font-bold uppercase transition-all duration-200 flex items-center gap-2 ${
                  activeTab === 'discrepancies'
                    ? 'bg-[#4F2C1D] text-white'
                    : 'text-stone-600 hover:bg-stone-50'
                }`}
              >
                <AlertCircle size={13} />
                <span>Show Mismatches ({comparisonData.filter(r => r.difference !== 0).length})</span>
              </button>
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-1.5 text-xs font-bold uppercase transition-all duration-200 flex items-center gap-2 ${
                  activeTab === 'all'
                    ? 'bg-[#4F2C1D] text-white'
                    : 'text-stone-600 hover:bg-stone-50'
                }`}
              >
                <SlidersHorizontal size={13} />
                <span>All Active Items ({comparisonData.length})</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-4 py-1.5 bg-white border border-stone-200 rounded-lg text-xs w-64 focus:outline-none focus:border-stone-400 transition-all font-semibold shadow-sm text-stone-700"
              />
              <Search size={13} className="absolute left-2.5 top-2.5 text-stone-400" />
            </div>
          </div>

          {/* Master Table Grid */}
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse table-auto text-xs min-w-max">
              <thead>
                <tr className="bg-[#4F2C1D] text-white uppercase text-[9px] tracking-wider divide-x divide-[#FAF9F5]/10">
                  <th className="p-3 text-center w-12 font-black">S.No</th>
                  <th className="p-3 w-64 font-black">Item Name</th>
                  <th className="p-3 font-black">Category</th>
                  <th className="p-3 text-center w-20 font-black">Opening</th>
                  <th className="p-3 text-center w-20 font-black">Received</th>
                  <th className="p-3 text-center w-20 font-black">Trans In</th>
                  <th className="p-3 text-center w-20 font-black">Sales (Sold)</th>
                  <th className="p-3 text-center w-16 font-black">Testing</th>
                  <th className="p-3 text-center w-16 font-black">Return</th>
                  <th className="p-3 text-center w-16 font-black">Trans Out</th>
                  <th className="p-3 text-center w-28 bg-[#3f2115] font-black">Expected Closing (System)</th>
                  <th className="p-3 text-center w-28 bg-[#4F2C1D]/90 font-black">Physical Closing</th>
                  <th className="p-3 text-center w-24 bg-[#5F3C2D] font-black">Discrepancy (Variance)</th>
                  <th className="p-3 text-center w-60 font-black">Reconciliation Actions (1-Click Update)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredComparison.map((row, idx) => {
                  const item = row.item;
                  const isMismatched = row.difference !== 0;
                  const itemKey = item.id;

                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-[#FAF9F5]/40 transition-colors uppercase divide-x divide-stone-100 ${
                        isMismatched ? 'bg-red-50/10' : ''
                      }`}
                    >
                      <td className="p-3 text-center bg-stone-50 font-mono font-bold text-stone-400 w-12">{idx + 1}</td>
                      <td className="p-3 font-semibold text-stone-800 max-w-xs truncate">
                        {item.name}
                        {row.calculationMode === 'closing' && (
                          <span className="ml-1.5 px-1 py-0.5 bg-indigo-50 text-indigo-700 text-[7px] rounded border border-indigo-200 font-black lowercase select-none">
                            closing-mode
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-stone-500 text-[10px] font-semibold lowercase">{item.category}</td>
                      
                      {/* Transaction Steps */}
                      <td className="p-3 text-center font-mono font-medium text-stone-500 bg-stone-50/10">{row.opening}</td>
                      <td className="p-3 text-center font-mono font-medium text-stone-600">{row.received || '-'}</td>
                      <td className="p-3 text-center font-mono font-medium text-indigo-600 bg-indigo-50/5">{row.transf_in || '-'}</td>
                      <td className="p-3 text-center font-mono font-bold text-stone-800">
                        {reconcilingItemId === item.id ? (
                          <input
                            type="text"
                            defaultValue={row.sold}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (!isNaN(v)) handleUpdateField(item.id, 'sold', v);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            }}
                            autoFocus
                            className="w-12 h-6 text-center text-xs font-mono font-bold border border-[#4F2C1D]/30 rounded focus:outline-none focus:ring-1 focus:ring-[#4F2C1D]"
                          />
                        ) : (
                          <span 
                            onClick={() => {
                              setReconcilingItemId(item.id);
                              setCustomValue('sold');
                            }}
                            className="hover:underline cursor-pointer border-b border-dashed border-stone-300 px-1 py-0.5"
                            title="Click to manually edit sales"
                          >
                            {row.sold}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-center font-mono font-medium text-amber-700">{row.testing || '-'}</td>
                      <td className="p-3 text-center font-mono font-medium text-stone-500">{row.returned || '-'}</td>
                      <td className="p-3 text-center font-mono font-medium text-stone-500">{row.transf_out || '-'}</td>

                      {/* Expected System Stock */}
                      <td className="p-3 text-center bg-stone-100 font-mono font-bold text-stone-800 text-xs w-28">
                        {row.expectedClosing}
                      </td>

                      {/* Outlet Physical Filled Closing */}
                      <td className="p-3 text-center bg-[#FAF9F5]/40 font-mono font-black text-[#4F2C1D] text-xs w-28">
                        {reconcilingItemId === item.id && customValue === 'closing' ? (
                          <input
                            type="text"
                            defaultValue={row.physicalClosing}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (!isNaN(v)) handleUpdateField(item.id, 'closing', v);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            }}
                            autoFocus
                            className="w-12 h-6 text-center text-xs font-mono font-bold border border-[#4F2C1D]/30 rounded focus:outline-none focus:ring-1 focus:ring-[#4F2C1D]"
                          />
                        ) : (
                          <span 
                            onClick={() => {
                              setReconcilingItemId(item.id);
                              setCustomValue('closing');
                            }}
                            className="hover:underline cursor-pointer border-b border-dashed border-stone-300 px-1 py-0.5"
                            title="Click to manually edit physical closing"
                          >
                            {row.physicalClosing}
                          </span>
                        )}
                      </td>

                      {/* Variance/Difference Column */}
                      <td className="p-3 text-center w-24">
                        {isMismatched ? (
                          <div className={`px-2 py-1 rounded font-mono font-black text-[11px] flex items-center justify-center gap-1 ${
                            row.difference < 0 
                              ? 'bg-red-100 text-red-800 border border-red-200 shadow-sm' 
                              : 'bg-amber-100 text-amber-800 border border-amber-200 shadow-sm'
                          }`}>
                            <AlertTriangle size={10} className="shrink-0" />
                            <span>{row.difference > 0 ? `+${row.difference}` : row.difference}</span>
                          </div>
                        ) : (
                          <span className="text-emerald-600 font-black font-brand-mono flex items-center justify-center gap-1 text-[10px]">
                            <Check size={12} className="stroke-[3]" />
                            MATCH
                          </span>
                        )}
                      </td>

                      {/* 1-Click Update Reconciliation Actions */}
                      <td className="p-2 text-center w-60 bg-stone-50/30">
                        {isMismatched ? (
                          <div className="flex gap-1.5 justify-center">
                            <button
                              onClick={() => handleAcceptPhysicalClosing(item.id, row.physicalClosing)}
                              className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[9px] font-extrabold uppercase transition-all shadow-sm flex items-center gap-1"
                              title="Set transaction logic to fit the physical stock by adjusting sales"
                            >
                              <Check size={9} className="stroke-[3]" />
                              Accept Physical Closing
                            </button>
                            <button
                              onClick={() => handleSetClosingToExpected(item.id, row.expectedClosing)}
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[9px] font-extrabold uppercase transition-all shadow-sm flex items-center gap-1"
                              title="Force the physical closing to match the theoretical system calculated stock"
                            >
                              <RefreshCw size={9} className="stroke-[3]" />
                              Force System Expected
                            </button>
                          </div>
                        ) : (
                          <span className="text-stone-400 text-[8px] uppercase tracking-wider font-extrabold">Reconciled & Synced</span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredComparison.length === 0 && (
                  <tr>
                    <td colSpan={14} className="p-16 text-center font-bold uppercase text-stone-400 tracking-wider">
                      {activeTab === 'discrepancies' 
                        ? 'PERFECT MATCH! No stock discrepancies found across any active items 🎉'
                        : 'No active catalog items match your search filter'
                      }
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
});

StockComparisonComponent.displayName = 'StockComparisonComponent';
