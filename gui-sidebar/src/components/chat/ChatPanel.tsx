import React, { useState } from 'react';
import styled from 'styled-components';
import { Button } from "../";
import { postToIde } from "../../util/ide";
import { CMD_NEW_CHAT_SESSION } from "../../../../src/base/common/configuration/configuration";

const ChatContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const ChatMessages = styled.div`
  flex: 1;
  overflow-y: auto;
`;

const ChatInput = styled.textarea`
  width: 100%;
  height: 50px;
  margin-top: 8px;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
`;

export const ChatPanel: React.FC = () => {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');

  const handleSendMessage = async () => {
    if (!input.trim()) return;
    setMessages([...messages, `Human: ${input}`]);
    setInput('');
    // 发送消息到 AI
    try {
      const response = await postToIde("command/run", {
        input: CMD_NEW_CHAT_SESSION,
        params: { prompt: input }
      });
      setMessages([...messages, `Human: ${input}`, `AI: ${response}`]);
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  return (
    <ChatContainer>
      <ChatMessages>
        {messages.map((msg, index) => (
          <div key={index}>{msg}</div>
        ))}
      </ChatMessages>
      <ChatInput
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="输入消息..."
      />
      <Button onClick={handleSendMessage}>发送</Button>
    </ChatContainer>
  );
};