import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { 
  FileSpreadsheet, 
  Calendar, 
  Save, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  TrendingUp,
  RotateCcw
} from 'lucide-react';
import { doc, setDoc } from 'firebase/firestore';
import { db, DAILY_RECORDS_COL } from '../lib/firebase';
import { OUTLETS } from './LedgerSheetComponent';
import { Item } from '../constants';

interface DateWiseClosingProps {
  items: Item[];
  records: any;
  setRecords: React.Dispatch<React.SetStateAction<any>>;
  currentDate: string;
  setCurrentDate: (date: string) => void;
  selectedOutletId: string;
  setIsSidebarOpen: (open: boolean) => void;
}

export const DateWiseClosingComponent = React.memo(({
  items,
  records,
  setRecords,
  currentDate,
  setCurrentDate,
  selectedOutletId,
  setIsSidebarOpen
}: DateWiseClosingProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [saveStatus, setSaveStatus] = useState<{ [key: string]: 'idle' | 'saving' | 'saved' | 'error' }>({});

  // Get the outlet name
  const outletName = useMemo(() => {
    return OUTLETS.find(o => o.id === selectedOutletId)?.name || `Outlet ${selectedOutletId}`;
  }, [selectedOutletId]);

  // Compute 4 days ending at currentDate timezone-safely
  const past4Days = useMemo(() => {
    const list = [];
    const [year, month, day] = currentDate.split('-').map(Number);
    for (let i = 3; i >= 0; i--) {
      const d = new Date(year, month - 1, day);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dVal = String(d.getDate()).padStart(2, '0');
      list.push(`${y}-${m}-${dVal}`);
    }
    return list;
  }, [currentDate]);

  // Format date for display in table headers (e.g. "30 May")
  const formatDateLabel = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[2], 10);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mIdx = parseInt(parts[1], 10) - 1;
      return `${day} ${months[mIdx] || ''}`;
    }
    return dateStr;
  };

  // Get closing value from records
  const getClosingValue = (dateStr: string, itemId: string) => {
    return Number(records[dateStr]?.[selectedOutletId]?.[itemId]?.closing ?? 0);
  };

  // Handle cell edit and save
  const handleCellEdit = async (dateStr: string, itemId: string, newValStr: string) => {
    const newVal = newValStr === '' ? 0 : Number(newValStr);
    if (isNaN(newVal)) return;

    const cellKey = `${dateStr}_${itemId}`;
    setSaveStatus(prev => ({ ...prev, [cellKey]: 'saving' }));

    // 1. Update React local state immediately for speed
    setRecords((prev: any) => {
      const nextRecords = { ...prev };
      if (!nextRecords[dateStr]) nextRecords[dateStr] = {};
      if (!nextRecords[dateStr][selectedOutletId]) nextRecords[dateStr][selectedOutletId] = {};
      
      const existingItem = nextRecords[dateStr][selectedOutletId][itemId] || {
        opening: 0, received: 0, sold: 0, testing: 0, returned: 0, wastage: 0, transf_out: 0, closing: 0, calculationMode: 'closing'
      };

      nextRecords[dateStr][selectedOutletId][itemId] = {
        ...existingItem,
        closing: newVal,
        calculationMode: 'closing'
      };
      
      localStorage.setItem('broomies_db_daily_records_v2', JSON.stringify(nextRecords));
      return nextRecords;
    });

    // 2. Persist to Firestore
    try {
      const docId = `${dateStr}_${selectedOutletId}`;
      const docRef = doc(db, DAILY_RECORDS_COL, docId);

      const dayData = records[dateStr] || {};
      const outletData = dayData[selectedOutletId] || {};
      const existingItem = outletData[itemId] || {
        opening: 0, received: 0, sold: 0, testing: 0, returned: 0, wastage: 0, transf_out: 0, closing: 0, calculationMode: 'closing'
      };

      const updatedRecords = {
        ...outletData,
        [itemId]: {
          ...existingItem,
          closing: newVal,
          calculationMode: 'closing'
        }
      };

      await setDoc(docRef, {
        date: dateStr,
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
      console.error("Error saving date wise closing cell to Firestore:", e);
      setSaveStatus(prev => ({ ...prev, [cellKey]: 'error' }));
    }
  };

  // Filter items based on search term
  const filteredItems = useMemo(() => {
    const activeItems = (items || []).filter(item => item.status !== 'inactive');
    return activeItems.filter(item => 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAF9F5] overflow-y-auto">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-6 bg-white border-b border-stone-200 shadow-sm gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-[#4F2C1D] text-white rounded">
              <Clock size={20} />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-[#4F2C1D]">DATE-WISE CLOSING ENTRY ({outletName})</h1>
          </div>
          <p className="text-xs text-stone-500 mt-1 uppercase tracking-wider font-semibold">
            Direct multi-day closing stock entry sheet matching physical daily paper logs
          </p>
        </div>

        {/* Date Navigator */}
        <div className="flex items-center gap-3 bg-[#FAF8F5] p-2 border border-stone-200 rounded-lg shrink-0">
          <Calendar size={15} className="text-[#4F2C1D]" />
          <span className="text-xs font-bold text-stone-600 uppercase">Target Ending Date:</span>
          <input 
            type="date" 
            value={currentDate} 
            onChange={(e) => setCurrentDate(e.target.value)}
            className="text-xs bg-white text-[#4F2C1D] border border-stone-300 font-bold px-2 py-1 rounded focus:outline-none shadow-sm"
          />
        </div>
      </div>

      {/* Main Grid Card */}
      <div className="flex-1 p-6">
        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-md flex flex-col">
          {/* Search Header */}
          <div className="p-4 bg-[#FAF9F5] border-b border-stone-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="text-xs font-bold text-[#4F2C1D] uppercase flex items-center gap-2">
              <TrendingUp size={16} />
              <span>Entering closing quantities for the last 4 days ending on {formatDateLabel(currentDate)}</span>
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-4 pr-10 py-1.5 bg-white border border-stone-200 rounded-lg text-xs w-64 focus:outline-none focus:border-stone-400 transition-all font-semibold shadow-sm text-stone-700"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-auto text-xs min-w-max">
              <thead>
                <tr className="bg-[#4F2C1D] text-white uppercase text-[10px] tracking-wider divide-x divide-[#FAF9F5]/10">
                  <th className="p-3 text-center w-12 font-black">S.No</th>
                  <th className="p-3 w-72 font-black">Item Name</th>
                  <th className="p-3 font-black">Category</th>
                  {past4Days.map(dateStr => (
                    <th key={dateStr} className="p-3 text-center w-32 font-black">
                      {formatDateLabel(dateStr)} <br />
                      <span className="text-[8px] font-normal lowercase">Closing</span>
                    </th>
                  ))}
                  <th className="p-3 text-center w-28 bg-[#3f2115] font-black">Total Closing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {filteredItems.map((item, idx) => {
                  // Calculate total sum of closing stock for the 4 days
                  let totalClosing = 0;
                  past4Days.forEach(dateStr => {
                    totalClosing += getClosingValue(dateStr, item.id);
                  });

                  return (
                    <tr key={item.id} className="hover:bg-[#FAF9F5]/60 transition-colors uppercase divide-x divide-stone-100">
                      <td className="p-3 text-center bg-stone-50 font-mono font-medium text-stone-500 w-12">{idx + 1}</td>
                      <td className="p-3 font-semibold text-[#4F2C1D] max-w-xs truncate">
                        {item.name}
                      </td>
                      <td className="p-3 text-stone-500 text-[10px] lowercase font-medium">{item.category}</td>
                      
                      {/* 4 Days input columns */}
                      {past4Days.map(dateStr => {
                        const cellKey = `${dateStr}_${item.id}`;
                        const currentVal = getClosingValue(dateStr, item.id);
                        const status = saveStatus[cellKey] || 'idle';

                        return (
                          <td key={dateStr} className="p-2 text-center w-32 bg-stone-50/20">
                            <div className="flex items-center justify-center gap-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                defaultValue={currentVal === 0 ? '' : String(currentVal)}
                                key={`${cellKey}_${currentVal}`} // Force re-render if value changes outside
                                onBlur={(e) => handleCellEdit(dateStr, item.id, e.target.value.replace(/[^0-9]/g, ''))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    (e.target as HTMLInputElement).blur();
                                  }
                                }}
                                placeholder="-"
                                className="w-16 h-8 text-center font-bold font-mono text-xs rounded border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#4F2C1D] focus:border-transparent transition-all bg-white text-stone-800"
                              />
                              {status === 'saving' && (
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" title="Saving..." />
                              )}
                              {status === 'saved' && (
                                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Saved successfully" />
                              )}
                              {status === 'error' && (
                                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Error saving" />
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Cumulative Total Closing column */}
                      <td className="p-3 text-center bg-stone-100/50 text-[#4F2C1D] font-extrabold font-mono text-xs w-28">
                        {totalClosing > 0 ? totalClosing : '-'}
                      </td>
                    </tr>
                  );
                })}

                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={3 + past4Days.length + 1} className="p-12 text-center font-brand-mono uppercase text-stone-400">
                      No matching items found
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

DateWiseClosingComponent.displayName = 'DateWiseClosingComponent';
