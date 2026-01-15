export default function ImageUpload({ onImage }) {
    return (
      <input
        type="file"
        accept="image/*"
        onChange={(e) => onImage(e.target.files[0])}
      />
    );
  }
  