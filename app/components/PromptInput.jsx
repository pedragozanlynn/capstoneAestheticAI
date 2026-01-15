export default function PromptInput({ onSubmit }) {
    const [prompt, setPrompt] = useState("");
  
    return (
      <div>
        <input
          placeholder="Describe your room design..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <button onClick={() => onSubmit(prompt)}>
          Generate Design
        </button>
      </div>
    );
  }
  