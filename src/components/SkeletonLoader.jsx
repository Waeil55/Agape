import React from 'react';

const SkeletonLoader = ({ type = 'page', rows = 5 }) => {
  if (type === 'page') {
    return (
      <div className="flex-1 min-h-0 bg-gray-50 p-4 space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded-xl animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded-lg w-3/4 animate-pulse" />
                  <div className="h-3 bg-gray-200 rounded-lg w-1/2 animate-pulse" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded-lg w-full animate-pulse" />
                <div className="h-3 bg-gray-200 rounded-lg w-5/6 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'chat') {
    return (
      <div className="flex-1 min-h-0 bg-[#f0f2f5] p-4 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[70%] space-y-1 ${i % 2 === 0 ? 'items-start' : 'items-end'}`}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gray-300 rounded-full animate-pulse" />
                <div className="h-3 bg-gray-300 rounded-lg w-16 animate-pulse" />
              </div>
              <div className={`h-10 ${i % 2 === 0 ? 'bg-white rounded-2xl rounded-bl-md' : 'bg-blue-500 rounded-2xl rounded-br-md'} animate-pulse`} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-white rounded-xl">
            <div className="w-12 h-12 bg-gray-200 rounded-full animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded-lg w-3/4 animate-pulse" />
              <div className="h-3 bg-gray-200 rounded-lg w-1/2 animate-pulse" />
            </div>
            <div className="w-16 h-8 bg-gray-200 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className="bg-white rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-200 rounded-xl animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded-lg w-2/3 animate-pulse" />
            <div className="h-3 bg-gray-200 rounded-lg w-1/3 animate-pulse" />
          </div>
        </div>
        <div className="h-32 bg-gray-200 rounded-xl animate-pulse" />
        <div className="flex gap-2">
          <div className="h-8 flex-1 bg-gray-200 rounded-lg animate-pulse" />
          <div className="h-8 flex-1 bg-gray-200 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  return null;
};

export default SkeletonLoader;
