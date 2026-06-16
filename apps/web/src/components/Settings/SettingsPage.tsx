import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface AISettings {
  openai_api_key: string;
  openai_base_url: string;
  openai_model: string;
  anthropic_api_key: string;
  anthropic_model: string;
  preferred_provider: string;
  has_openai: boolean;
  has_anthropic: boolean;
}

interface TestResult {
  [provider: string]: { ok: boolean; message: string };
}

const SettingsPage: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [settings, setSettings] = useState<AISettings>({
    openai_api_key: '',
    openai_base_url: 'https://api.openai.com/v1',
    openai_model: 'gpt-4o',
    anthropic_api_key: '',
    anthropic_model: 'claude-sonnet-4-20250514',
    preferred_provider: 'auto',
    has_openai: false,
    has_anthropic: false,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'ai' | 'general'>('ai');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.getAISettings();
      setSettings(data);
    } catch (e: any) {
      setMsg({ type: 'err', text: '加载设置失败: ' + e.message });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload: Record<string, string> = {};
      // Only send API key if user actually changed it (not masked)
      if (!settings.openai_api_key.includes('****')) {
        payload.openai_api_key = settings.openai_api_key;
      }
      if (settings.openai_base_url) payload.openai_base_url = settings.openai_base_url;
      if (settings.openai_model) payload.openai_model = settings.openai_model;
      if (!settings.anthropic_api_key.includes('****')) {
        payload.anthropic_api_key = settings.anthropic_api_key;
      }
      if (settings.anthropic_model) payload.anthropic_model = settings.anthropic_model;
      if (settings.preferred_provider) payload.preferred_provider = settings.preferred_provider;

      await api.updateAISettings(payload);
      setMsg({ type: 'ok', text: '设置已保存' });
      await loadSettings();
    } catch (e: any) {
      setMsg({ type: 'err', text: '保存失败: ' + e.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testAIConnection();
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ error: { ok: false, message: e.message } });
    } finally {
      setTesting(false);
    }
  };

  const update = (key: keyof AISettings, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[640px] max-h-[85vh] bg-dark-900 border border-dark-700 rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            ⚙️ 设置
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-white flex items-center justify-center transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 gap-1 border-b border-dark-800">
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'ai'
                ? 'text-cognition-400 border-cognition-400'
                : 'text-dark-400 border-transparent hover:text-dark-200'
            }`}
          >
            🤖 AI 模型配置
          </button>
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'general'
                ? 'text-cognition-400 border-cognition-400'
                : 'text-dark-400 border-transparent hover:text-dark-200'
            }`}
          >
            🔧 通用设置
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {activeTab === 'ai' && (
            <>
              {/* Provider preference */}
              <div>
                <label className="block text-sm font-medium text-dark-200 mb-2">
                  首选 AI 提供商
                </label>
                <select
                  value={settings.preferred_provider}
                  onChange={e => update('preferred_provider', e.target.value)}
                  className="w-full h-10 px-3 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-cognition-500 focus:outline-none transition-colors"
                >
                  <option value="auto">自动选择 (哪个可用用哪个)</option>
                  <option value="openai">优先 OpenAI</option>
                  <option value="anthropic">优先 Anthropic</option>
                </select>
                <p className="mt-1 text-xs text-dark-500">AI 功能将优先使用选定的提供商</p>
              </div>

              {/* OpenAI Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${settings.has_openai ? 'bg-green-500' : 'bg-dark-600'}`} />
                  <h3 className="text-sm font-semibold text-dark-200">OpenAI 兼容接口</h3>
                  <span className="text-xs text-dark-500">(支持 DeepSeek、通义千问等兼容接口)</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-dark-300 mb-1.5">API Key</label>
                  <input
                    type="password"
                    value={settings.openai_api_key}
                    onChange={e => update('openai_api_key', e.target.value)}
                    placeholder="sk-..."
                    className="w-full h-9 px-3 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:border-cognition-500 focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-dark-300 mb-1.5">Base URL</label>
                  <input
                    type="text"
                    value={settings.openai_base_url}
                    onChange={e => update('openai_base_url', e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full h-9 px-3 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:border-cognition-500 focus:outline-none transition-colors"
                  />
                  <p className="mt-1 text-xs text-dark-500">DeepSeek: https://api.deepseek.com/v1</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-dark-300 mb-1.5">模型名称</label>
                  <input
                    type="text"
                    value={settings.openai_model}
                    onChange={e => update('openai_model', e.target.value)}
                    placeholder="gpt-4o"
                    className="w-full h-9 px-3 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:border-cognition-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Anthropic Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${settings.has_anthropic ? 'bg-green-500' : 'bg-dark-600'}`} />
                  <h3 className="text-sm font-semibold text-dark-200">Anthropic 接口</h3>
                </div>

                <div>
                  <label className="block text-xs font-medium text-dark-300 mb-1.5">API Key</label>
                  <input
                    type="password"
                    value={settings.anthropic_api_key}
                    onChange={e => update('anthropic_api_key', e.target.value)}
                    placeholder="sk-ant-..."
                    className="w-full h-9 px-3 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:border-cognition-500 focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-dark-300 mb-1.5">模型名称</label>
                  <input
                    type="text"
                    value={settings.anthropic_model}
                    onChange={e => update('anthropic_model', e.target.value)}
                    placeholder="claude-sonnet-4-20250514"
                    className="w-full h-9 px-3 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white placeholder-dark-500 focus:border-cognition-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>

              {/* Test results */}
              {testResult && (
                <div className="space-y-2 p-4 bg-dark-800 rounded-lg border border-dark-700">
                  <h4 className="text-xs font-semibold text-dark-300 mb-2">连接测试结果</h4>
                  {Object.entries(testResult).map(([provider, result]) => (
                    <div key={provider} className="flex items-center gap-2 text-xs">
                      <span className={result.ok ? 'text-green-400' : 'text-red-400'}>
                        {result.ok ? '✓' : '✗'}
                      </span>
                      <span className="text-dark-300">{provider}:</span>
                      <span className={result.ok ? 'text-green-300' : 'text-red-300'}>
                        {result.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'general' && (
            <div className="text-sm text-dark-400 py-8 text-center">
              <p className="text-dark-300 mb-2">通用设置</p>
              <p className="text-xs text-dark-500">更多设置项将在后续版本中添加</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-dark-800">
          <div>
            {msg && (
              <span className={`text-xs ${msg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                {msg.text}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 text-sm bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white rounded-lg border border-dark-700 transition-colors disabled:opacity-50"
            >
              {testing ? '测试中...' : '🔗 测试连接'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 text-sm bg-cognition-600 hover:bg-cognition-500 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {saving ? '保存中...' : '💾 保存设置'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
