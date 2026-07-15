import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowRightLeft,
  Calendar, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle,
  TrendingDown,
  Activity,
  Check,
  Sparkles,
  Layers,
  Database
} from 'lucide-react';
import { OUTLETS, Item, PRIORITY_ITEM_NAMES, getCategoryWeight } from '../constants';

interface StockComparisonProps {
  items: Item[];
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
  const [activeTab, setActiveTab] = useState<'all' | 'discrepancies'>('all');
  const [selectedOutletFilter, setSelectedOutletFilter] = useState<string>('all');

  // Retail outlets to compare (exclude kitchen/bakery 'bk')
  const outletsToCompare = useMemo(() => {
    return OUTLETS.filter(o => o.id !== 'bk');
  }, []);

  // Filter items to only include active cakes and pastries (matching DateWiseClosingComponent)
  const activeCakesAndPastries = useMemo(() => {
    return (items || [])
      .filter(item => {
        if (item.status === 'inactive') return false;
        const cat = (item.category || '').toLowerCase();
        return cat.includes('cake') || cat.includes('pastry') || cat.includes('pastries');
      })
      .sort((a, b) => {
        const priorityIndexA = PRIORITY_ITEM_NAMES.indexOf(a.name);
        const priorityIndexB = PRIORITY_ITEM_NAMES.indexOf(b.name);
        
        if (priorityIndexA !== -1 || priorityIndexB !== -1) {
          const valA = priorityIndexA === -1 ? 9999 : priorityIndexA;
          const valB = priorityIndexB === -1 ? 9999 : priorityIndexB;
          if (valA !== valB) return valA - valB;
        }

        const weightA = getCategoryWeight(a.category);
        const weightB = getCategoryWeight(b.category);
        if (weightA !== weightB) return weightA - weightB;

        return a.name.localeCompare(b.name);
      });
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

  // Build comparative data consolidated across selected outlets
  const consolidatedData = useMemo(() => {
    const dayData = records[currentDate] || {};

    return activeCakesAndPastries.map(item => {
      let totalPhysicalClosing = 0;
      let totalExpectedClosing = 0;

      const outlets = selectedOutletFilter === 'all' 
        ? outletsToCompare 
        : outletsToCompare.filter(o => o.id === selectedOutletFilter);

      outlets.forEach(outlet => {
        const outletRecord = dayData[outlet.id]?.[item.id] || {};
        
        // Retrieve transaction details
        const opening = Number(outletRecord.opening ?? getPreviousClosingStock(item.id, currentDate, outlet.id) ?? 0);
        const received = Number(outletRecord.received ?? 0);
        const transf_in = Number(outletRecord.transf_in ?? 0);
        const sold = Number(outletRecord.sold ?? 0);
        const testing = Number(outletRecord.testing ?? 0);
        const returned = Number(outletRecord.returned ?? 0);
        const transf_out = Number(outletRecord.transf_out ?? 0);
        
        // 1. Physical Closing (date wise closing filled by bando)
        const manufactureClosing = outletRecord.manufactureClosing;
        const physicalClosing: number = (manufactureClosing && Object.keys(manufactureClosing).length > 0)
          ? (Object.values(manufactureClosing).reduce((sum: number, val: any) => sum + Number(val || 0), 0) as number)
          : 0;

        // 2. Outlets Console Closing (expected closing calculated by system based on sales / sold logs)
        const expectedClosing = opening + received + transf_in - sold - testing - returned - transf_out;

        totalPhysicalClosing += physicalClosing;
        totalExpectedClosing += expectedClosing;
      });

      const difference = totalPhysicalClosing - totalExpectedClosing;

      return {
        item,
        totalPhysicalClosing,
        totalExpectedClosing,
        difference
      };
    });
  }, [activeCakesAndPastries, records, currentDate, outletsToCompare, selectedOutletFilter]);

  // Compute stats for top badges
  const stats = useMemo(() => {
    let totalItems = consolidatedData.length;
    let discrepancyCount = 0;
    let grandPhysicalClosing = 0;
    let grandExpectedClosing = 0;

    consolidatedData.forEach(row => {
      grandPhysicalClosing += row.totalPhysicalClosing;
      grandExpectedClosing += row.totalExpectedClosing;
      if (row.difference !== 0) {
        discrepancyCount++;
      }
    });

    return {
      totalItems,
      discrepancyCount,
      grandPhysicalClosing,
      grandExpectedClosing,
      matchRate: totalItems > 0 ? Math.round(((totalItems - discrepancyCount) / totalItems) * 100) : 100
    };
  }, [consolidatedData]);

  // Apply search & tab filters
  const filteredData = useMemo(() => {
    return consolidatedData.filter(row => {
      const matchesSearch = row.item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (row.item.category && row.item.category.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesTab = activeTab === 'all' || row.difference !== 0;
      return matchesSearch && matchesTab;
    }).sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)); // Sort by highest variance
  }, [consolidatedData, searchTerm, activeTab]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-y-auto">
      {/* Header Bar */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between p-6 bg-white border-b border-stone-200 gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 bg-[#4F2C1D] text-white flex items-center justify-center rounded-lg shadow-sm">
              <ArrowRightLeft size={20} />
            </span>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-brand-text uppercase">
                {selectedOutletFilter === 'all' 
                  ? 'Consolidated Stock Comparison' 
                  : `${outletsToCompare.find(o => o.id === selectedOutletFilter)?.name} Stock Comparison`}
              </h1>
              <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider mt-0.5">
                Comparing Date-Wise Physical Closing (Filled by Staff) vs Outlets Console {selectedOutletFilter === 'all' ? 'closing' : 'end quantity'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          {/* Outlet Selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-stone-200 rounded-lg shadow-sm w-full sm:w-auto">
            <ArrowRightLeft size={14} className="text-[#4F2C1D]" />
            <span className="text-[9px] font-black text-stone-500 uppercase">SELECT OUTLET:</span>
            <select 
              value={selectedOutletFilter} 
              onChange={(e) => setSelectedOutletFilter(e.target.value)}
              className="text-xs font-extrabold text-[#4F2C1D] bg-transparent border-none p-0 focus:outline-none focus:ring-0 cursor-pointer"
            >
              <option value="all">ALL OUTLETS (CONSOLIDATED)</option>
              {outletsToCompare.map(o => (
                <option key={o.id} value={o.id}>{o.name.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {/* Date Selector */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-stone-200 rounded-lg shadow-sm w-full sm:w-auto">
            <Calendar size={14} className="text-[#4F2C1D]" />
            <span className="text-[9px] font-black text-stone-500 uppercase">AUDIT DATE:</span>
            <input 
              type="date" 
              value={currentDate} 
              onChange={(e) => setCurrentDate(e.target.value)}
              className="text-xs font-extrabold text-[#4F2C1D] bg-transparent border-none p-0 focus:outline-none focus:ring-0"
            />
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-1 p-6 flex flex-col gap-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 border-2 border-stone-200 rounded-xl flex items-center justify-between shadow-sm">
            <div>
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Cakes & Pastries</span>
              <h3 className="text-2xl font-black text-brand-text mt-1">{stats.totalItems} items</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
              <Layers size={18} />
            </div>
          </div>

          <div className="bg-white p-5 border-2 border-stone-200 rounded-xl flex items-center justify-between shadow-sm">
            <div>
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">Total Discrepancies</span>
              <h3 className={`text-2xl font-black mt-1 ${stats.discrepancyCount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                {stats.discrepancyCount}
              </h3>
            </div>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${stats.discrepancyCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <AlertTriangle size={18} />
            </div>
          </div>

          <div className="bg-white p-5 border-2 border-stone-200 rounded-xl flex items-center justify-between shadow-sm">
            <div>
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                {selectedOutletFilter === 'all' ? 'Total Physical Closing' : 'Physical Closing'}
              </span>
              <h3 className="text-2xl font-black text-brand-text mt-1">{stats.grandPhysicalClosing} pcs</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#4F2C1D]/5 text-[#4F2C1D] flex items-center justify-center">
              <CheckCircle2 size={18} />
            </div>
          </div>

          <div className="bg-white p-5 border-2 border-stone-200 rounded-xl flex items-center justify-between shadow-sm">
            <div>
              <span className="text-[9px] font-black text-stone-400 uppercase tracking-widest">
                {selectedOutletFilter === 'all' ? 'Total Console Closing' : 'Console End Quantity'}
              </span>
              <h3 className="text-2xl font-black text-brand-text mt-1">{stats.grandExpectedClosing} pcs</h3>
            </div>
            <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Database size={18} />
            </div>
          </div>
        </div>

        {/* Tab Controls and Search */}
        <div className="bg-white border-2 border-stone-200 rounded-xl overflow-hidden shadow-sm flex flex-col flex-1">
          <div className="p-4 bg-stone-50 border-b border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Filter Tabs */}
            <div className="flex border-2 border-brand-text bg-stone-100 p-0.5 rounded-lg self-start">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'all' ? 'bg-brand-text text-white shadow-sm' : 'text-stone-600 hover:text-brand-text'}`}
              >
                {selectedOutletFilter === 'all' ? 'All Cakes & Pastries' : `Items - ${outletsToCompare.find(o => o.id === selectedOutletFilter)?.name}`} ({consolidatedData.length})
              </button>
              <button
                onClick={() => setActiveTab('discrepancies')}
                className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'discrepancies' ? 'bg-brand-text text-white shadow-sm' : 'text-stone-600 hover:text-brand-text'}`}
              >
                <AlertCircle size={13} />
                Mismatches Only ({consolidatedData.filter(r => r.difference !== 0).length})
              </button>
            </div>

            {/* Search */}
            <div className="relative shrink-0 w-full sm:w-72">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-stone-400">
                <Search size={14} />
              </span>
              <input
                type="text"
                placeholder="Search cakes or pastries..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-1.5 bg-white border border-stone-200 rounded-lg text-xs w-full focus:outline-none focus:border-brand-text focus:ring-1 focus:ring-brand-text font-semibold shadow-sm text-stone-700"
              />
            </div>
          </div>

          {/* Clean 4-Column Table */}
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse table-auto text-xs min-w-max">
              <thead>
                <tr className="bg-[#4F2C1D] text-white uppercase text-[9px] tracking-wider divide-x divide-white/5 font-black">
                  <th className="p-4 w-12 text-center">S.No</th>
                  <th className="p-4">Item Name & Category</th>
                  <th className="p-4 text-center w-64 bg-[#462619]">
                    {selectedOutletFilter === 'all' ? 'Total Physical Closing (Date-Wise)' : 'Physical Closing (Date-Wise)'}
                  </th>
                  <th className="p-4 text-center w-64 bg-[#3d2014]">
                    {selectedOutletFilter === 'all' ? 'Total Console Closing (Outlets)' : 'Console End Quantity'}
                  </th>
                  <th className="p-4 text-center w-48 bg-brand-text">Variance (Difference)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium">
                {filteredData.map((row, idx) => {
                  const item = row.item;
                  const isMismatched = row.difference !== 0;

                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50/80 transition-colors uppercase divide-x divide-stone-100 ${
                        isMismatched ? 'bg-rose-50/5' : 'bg-emerald-50/5'
                      }`}
                    >
                      {/* S.No */}
                      <td className="p-4 text-center bg-stone-50 font-mono text-stone-400 w-12">
                        {idx + 1}
                      </td>

                      {/* Item Details */}
                      <td className="p-4">
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

                      {/* Total Physical Closing (Filled in Date-Wise view) */}
                      <td className="p-4 text-center font-mono text-stone-800 text-sm font-black bg-stone-50/20 w-64">
                        {row.totalPhysicalClosing} pcs
                      </td>

                      {/* Total Outlets Console Closing */}
                      <td className="p-4 text-center font-mono text-stone-800 text-sm font-black bg-stone-50/20 w-64">
                        {row.totalExpectedClosing} pcs
                      </td>

                      {/* Variance / Difference */}
                      <td className="p-4 text-center w-48 bg-[#FAF9F5]/30">
                        {isMismatched ? (
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono font-black text-[12px] border ${
                            row.difference < 0 
                              ? 'bg-rose-100 text-rose-800 border-rose-200 shadow-sm' 
                              : 'bg-amber-100 text-amber-800 border-amber-200 shadow-sm'
                          }`}>
                            <AlertTriangle size={12} className="shrink-0" />
                            <span>{row.difference > 0 ? `+${row.difference}` : row.difference} PCS</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-1.5 rounded-lg font-black text-[11px] shadow-sm">
                            <Check size={13} className="stroke-[3]" />
                            MATCHED
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-16 text-center font-bold text-stone-400 uppercase tracking-wider bg-stone-50/50">
                      {activeTab === 'discrepancies' 
                        ? (selectedOutletFilter === 'all'
                            ? 'PERFECT MATCH! No stock discrepancies found across any active cakes & pastries 🎉'
                            : `PERFECT MATCH! No stock discrepancies found for ${outletsToCompare.find(o => o.id === selectedOutletFilter)?.name} 🎉`)
                        : 'No active cakes or pastries match your search filter'
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
