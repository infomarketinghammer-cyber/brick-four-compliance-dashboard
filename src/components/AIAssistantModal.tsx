import React, { useState } from 'react';
import { Sparkles, X, Send, Bot, User as UserIcon, HelpCircle, ArrowRight } from 'lucide-react';
import { api } from '../services/api';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  periodId: string;
  periodName: string;
  organizationName: string;
}

// Minimal **bold** rendering for the advisor's markdown-style answers
const renderRichText = (text: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <React.Fragment key={i}>{part}</React.Fragment>
  );

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({ isOpen, onClose, periodId, periodName, organizationName }) => {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([
    {
      role: 'assistant',
      text: `Hello, I am your **AI Legal Intelligence Advisor**${organizationName ? ` for ${organizationName}` : ''}.\n\nI answer from the department's live KRA/KPI scores, contracts, RERA compliance filings, litigation docket, and risk register.\n\nHow can I assist your review today?`,
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const quickPrompts = [
    'Which KRAs are below target?',
    "Summarize this month's Legal Department performance",
    'Which projects have the highest legal risk?',
    'Which compliance items or RERA filings are overdue?',
    'Which contracts are approaching expiry or SLA breach?',
  ];

  const handleAsk = async (q: string) => {
    if (!q.trim() || isLoading) return;
    const userQ = q.trim();
    setQuestion('');
    setMessages((prev) => [...prev, { role: 'user', text: userQ }]);
    setIsLoading(true);

    try {
      const answer = await api.askAI(userQ, periodId);
      setMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `I encountered an issue analyzing the current metrics: ${err.message || 'Please try again.'}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-400/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold">
                AI Legal Department Intelligence Advisor
              </h3>
              <p className="text-[11px] text-slate-400">
                Answering for {periodName} from live registers and calculated KPI data.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close AI advisor"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Stream */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4 text-xs">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`max-w-[85%] p-4 rounded-2xl whitespace-pre-wrap leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-brand-gradient text-white font-medium rounded-br-none'
                    : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-bl-none'
                }`}
              >
                {renderRichText(m.text)}
              </div>
              {m.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                  <UserIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start items-center text-slate-500">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                <div className="w-2 h-2 rounded-full bg-brand-gradient animate-bounce" />
                <div className="w-2 h-2 rounded-full bg-brand-gradient animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 rounded-full bg-brand-gradient animate-bounce [animation-delay:0.4s]" />
                <span className="text-[11px] text-slate-500 ml-1">Analyzing operational records...</span>
              </div>
            </div>
          )}
        </div>

        {/* Quick Suggested Queries */}
        <div className="px-6 py-2 border-t border-slate-100 bg-slate-50/50 flex flex-wrap gap-1.5">
          {quickPrompts.map((qp, i) => (
            <button
              key={i}
              onClick={() => handleAsk(qp)}
              disabled={isLoading}
              className="text-[10px] font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-1 rounded-full transition-all"
            >
              {qp}
            </button>
          ))}
        </div>

        {/* Input Footer */}
        <div className="p-4 border-t border-slate-200 bg-white">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk(question);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              placeholder="Ask about KRA scores, contract turnaround, litigation risk, or compliance..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={isLoading || !question.trim()}
              className="p-2.5 bg-brand-gradient hover:opacity-90 disabled:opacity-50 text-white rounded-xl transition-all shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
