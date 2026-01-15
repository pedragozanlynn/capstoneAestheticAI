export default function ResultView({ image, description }) {
    if (!image) return null;
  
    return (
      <div>
        <img src={image} alt="Room Design" />
        <p>{description}</p>
      </div>
    );
  }
  