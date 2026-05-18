import React, { useState } from 'react';
import { X } from 'lucide-react';

const OdometerInput = ({ onSubmit, onCancel, lastReading, isFirstTrip }) => {
  const [odometerValue, setOdometerValue] = useState('');
  const [lastThreeDigits, setLastThreeDigits] = useState('');
  const [inputMode, setInputMode] = useState(isFirstTrip ? 'full' : 'partial');

  const handleFullInput = (value) => {
    if (!isNaN(value) && value >= 0) {
      setOdometerValue(value);
    }
  };

  const handlePartialInput = (value) => {
    const digits = value.replace(/\D/g, '').slice(-3);
    setLastThreeDigits(digits);
  };

  const handleSubmit = () => {
    let finalValue;
    if (inputMode === 'full') {
      finalValue = parseInt(odometerValue) || 0;
    } else {
      const lastThree = parseInt(lastThreeDigits) || 0;
      const prefix = Math.floor(lastReading / 1000) * 1000;
      finalValue = prefix + lastThree;
    }
    onSubmit(finalValue);
  };

  const handleQuickFill = (offset) => {
    const newValue = lastReading + offset;
    handleFullInput(newValue.toString());
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end z-50 animate-in">
      <div className="w-full bg-white dark:bg-gray-800 rounded-t-xl p-6 animate-in slide-in-from-bottom">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Odometer Reading</h2>
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full">
            <X size={24} />
          </button>
        </div>

        <div className="space-y-4">
          {!isFirstTrip && (
            <div className="flex gap-2">
              <button
                onClick={() => setInputMode('partial')}
                className={`flex-1 py-2 rounded font-semibold transition-colors ${
                  inputMode === 'partial'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white'
                }`}
              >
                Last 3 Digits
              </button>
              <button
                onClick={() => setInputMode('full')}
                className={`flex-1 py-2 rounded font-semibold transition-colors ${
                  inputMode === 'full'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white'
                }`}
              >
                Full Reading
              </button>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold mb-1">
              {inputMode === 'full' ? 'Current Odometer Reading' : 'Last 3 Digits of Odometer'}
            </label>
            {inputMode === 'full' ? (
              <input
                type="number"
                value={odometerValue}
                onChange={(e) => handleFullInput(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-lg font-bold"
                placeholder="Enter full odometer reading"
                autoFocus
              />
            ) : (
              <input
                type="text"
                value={lastThreeDigits}
                onChange={(e) => handlePartialInput(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:outline-none focus:border-blue-500 text-lg font-bold text-center tracking-widest"
                placeholder="---"
                maxLength={3}
                autoFocus
              />
            )}
          </div>

          {lastReading > 0 && (
            <div className="flex gap-2">
              {[10, 50, 100].map(offset => (
                <button
                  key={offset}
                  onClick={() => handleQuickFill(offset)}
                  className="flex-1 py-2 bg-gray-200 dark:bg-gray-700 rounded font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm"
                >
                  +{offset}
                </button>
              ))}
            </div>
          )}

          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Last reading: {lastReading.toLocaleString()} mi
          </div>

          <button
            onClick={handleSubmit}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 transition-colors"
          >
            Record Reading
          </button>
        </div>
      </div>
    </div>
  );
};

export default OdometerInput;
