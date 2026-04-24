import React, { useState, useCallback } from 'react';
import { FaRobot, FaTimes, FaInfoCircle, FaSpinner, FaGlobe, FaSun, FaThermometerHalf, FaCompass } from 'react-icons/fa';
import { toast } from 'react-toastify';

const AiHintOverlay = ({ hints, onClose, onHintClick }) => {
  if (!hints || hints.length === 0) return null;

  return (
    <div className="ai-hint-overlay">
      <div className="ai-hint-close-btn" onClick={onClose}>
        <FaTimes />
      </div>
      
      {hints.map((hint) => (
        <div
          key={hint.id}
          className="ai-hint-marker"
          style={{
            left: `${hint.x}%`,
            top: `${hint.y}%`,
          }}
          onClick={() => onHintClick(hint)}
          title={hint.title}
        >
          <div className="ai-hint-pulse"></div>
          <div className="ai-hint-dot"></div>
          <div className="ai-hint-label">{hint.id}</div>
        </div>
      ))}
    </div>
  );
};

const AiHintModal = ({ hint, onClose }) => {
  if (!hint) return null;

  const getTypeIcon = (type) => {
    const typeLower = type.toLowerCase();
    if (typeLower.includes('建筑') || typeLower.includes('风格')) return '🏛️';
    if (typeLower.includes('植被') || typeLower.includes('树木')) return '🌳';
    if (typeLower.includes('地形') || typeLower.includes('地貌')) return '⛰️';
    if (typeLower.includes('标识') || typeLower.includes('交通') || typeLower.includes('道路')) return '🚦';
    if (typeLower.includes('标志性') || typeLower.includes('地标')) return '🗼';
    if (typeLower.includes('太阳') || typeLower.includes('方位') || typeLower.includes('半球')) return '☀️';
    if (typeLower.includes('车辆') || typeLower.includes('汽车')) return '🚗';
    if (typeLower.includes('行人') || typeLower.includes('穿着')) return '�';
    if (typeLower.includes('广告') || typeLower.includes('招牌') || typeLower.includes('文字')) return '📺';
    if (typeLower.includes('气候') || typeLower.includes('温度')) return '🌡️';
    if (typeLower.includes('经度') || typeLower.includes('纬度') || typeLower.includes('地理') || typeLower.includes('位置')) return '🌍';
    if (typeLower.includes('时区') || typeLower.includes('地区')) return '🌐';
    if (typeLower.includes('文化')) return '🎭';
    if (typeLower.includes('语言')) return '�️';
    return '💡';
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return '#4ade80';
    if (confidence >= 0.6) return '#fbbf24';
    return '#f87171';
  };

  const getConfidenceText = (confidence) => {
    if (confidence >= 0.8) return '高';
    if (confidence >= 0.6) return '中';
    return '低';
  };

  return (
    <div className="ai-hint-modal-backdrop" onClick={onClose}>
      <div className="ai-hint-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-hint-modal-header">
          <div className="ai-hint-modal-icon">
            {getTypeIcon(hint.type)}
          </div>
          <div className="ai-hint-modal-title">
            <h3>{hint.title}</h3>
            <span className="ai-hint-modal-type">{hint.type}</span>
          </div>
          <button className="ai-hint-modal-close" onClick={onClose}>
            <FaTimes />
          </button>
        </div>
        
        <div className="ai-hint-modal-content">
          <p className="ai-hint-modal-hint">{hint.hint}</p>
        </div>
        
        <div className="ai-hint-modal-footer">
          <div className="ai-hint-confidence">
            <FaInfoCircle />
            <span>置信度：</span>
            <span 
              className="ai-hint-confidence-value"
              style={{ color: getConfidenceColor(hint.confidence) }}
            >
              {getConfidenceText(hint.confidence)} ({Math.round(hint.confidence * 100)}%)
            </span>
          </div>
          <p className="ai-hint-disclaimer">
            提示仅供参考，AI分析可能存在偏差。请结合多方面信息进行判断。
          </p>
        </div>
      </div>
    </div>
  );
};

const AiHintButton = ({ lat, lng, disabled, onHintsLoaded, hintsShown, onClearHints }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (!lat || !lng || disabled || loading) return;

    if (hintsShown) {
      onClearHints?.();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(window.cConfig?.apiUrl + '/api/aiHint', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lat, lng }),
      });

      const data = await response.json();

      if (data.success && data.hints && data.hints.length > 0) {
        onHintsLoaded?.(data.hints);
        
        if (data.usedGeoAnalysis || data.fallback) {
          toast.info('AI提示已生成（地理分析模式），点击光圈查看详情');
        } else {
          toast.success('AI提示已生成！点击光圈查看详情');
        }
      } else {
        toast.error('无法生成AI提示，请稍后重试');
      }
    } catch (error) {
      console.error('AI Hint Error:', error);
      toast.error('获取AI提示失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  }, [lat, lng, disabled, loading, hintsShown, onHintsLoaded, onClearHints]);

  return (
    <button
      className={`ai-hint-btn ${hintsShown ? 'active' : ''} ${loading ? 'loading' : ''}`}
      onClick={handleClick}
      disabled={disabled || loading}
      title={hintsShown ? '隐藏AI提示' : '获取AI辅助提示'}
    >
      {loading ? (
        <>
          <FaSpinner className="spinner" />
          <span>分析中...</span>
        </>
      ) : (
        <>
          <FaRobot />
          <span>{hintsShown ? '隐藏提示' : 'AI辅助'}</span>
        </>
      )}
    </button>
  );
};

export { AiHintButton, AiHintOverlay, AiHintModal };
