import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight, Play, Calendar, Tag, Info, X } from 'lucide-react';
import './App.css';

// --- Type Definitions ---
interface SourceInfo { directors: string[]; artists: string[]; production_companies: string[]; brand?: string; }
interface ImageResult { id: string; urls: { thumbnail: string; medium_resolution: string; video_thumbnail?: string; }; title: string; year?: string; category?: string; caption?: string; has_video: boolean; source_info: SourceInfo; }
interface SearchParams { query: string; director: string; movieId: string; }
interface ApiResponse { success: boolean; data: ImageResult[]; total_available: number; results_count: number; query: string; searchParams: SearchParams; error?: string; }
interface MovieSuggestion { id: string; name: string; hit_score: number; }
interface MovieSuggestionResponse { success: boolean; data?: MovieSuggestion[]; error?: string; }
interface MetasResponse { success: boolean; data?: { similar_images: ImageResult[]; associated_searches: string[]; cinematographers: string[]; colors: string[]; imdb_url?: string; }; error?: string; }
interface EmailModalProps { show: boolean; onClose: () => void; onSubmit: (email: string) => Promise<{ success: boolean; error?: string }>; }

// --- Email Collection Modal Component ---
const EmailModal: React.FC<EmailModalProps> = ({ show, onClose, onSubmit }) => {
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (show) {
      setEmail('');
      setLocalError('');
      setIsSubmitting(false);
      setSuccessMessage('');
    }
  }, [show]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      setLocalError('Please enter a valid email address.');
      return;
    }
    setLocalError('');
    setIsSubmitting(true);
    
    try {
      const result = await onSubmit(email);
      if (result.success) {
        setSuccessMessage('Thank you for joining! You rock. ✨');
        setTimeout(() => {
          onClose(); // Close modal after showing success message
        }, 2500);
      } else {
        setLocalError(result.error || 'An unknown error occurred. Please try again.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setLocalError(err.message || 'Failed to connect. Please check your network.');
      setIsSubmitting(false);
    }
  };

  if (!show) return null;

  return (
    <div className="email-modal-overlay" onClick={onClose}>
      <div className="email-modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-button email-close-button" onClick={onClose}>
          <X size={24} />
        </button>
        
        {successMessage ? (
          <div className="email-modal-success">
            <h3>Awesome!</h3>
            <p>{successMessage}</p>
          </div>
        ) : (
          <>
            <h3>Are you enjoying this?</h3>
            <p>Join our community to get alerted on new features and updates.</p>
            <form onSubmit={handleSubmit} className="email-modal-form">
              <input
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
                className="email-modal-input"
              />
              <button type="submit" disabled={isSubmitting} className="email-modal-button">
                {isSubmitting ? 'Joining...' : 'Join Community'}
              </button>
            </form>
            {localError && <p className="email-modal-error">{localError}</p>}
            <button onClick={onClose} disabled={isSubmitting} className="email-modal-dismiss">
              No, thanks
            </button>
          </>
        )}
      </div>
    </div>
  );
};


function App() {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(0);
  const [selectedImage, setSelectedImage] = useState<ImageResult | null>(null);
  const [showVideo, setShowVideo] = useState<boolean>(false);
  const [movieSuggestions, setMovieSuggestions] = useState<MovieSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [showEmailModal, setShowEmailModal] = useState<boolean>(false);
  const [similarImages, setSimilarImages] = useState<ImageResult[]>([]);
  const [loadingSimilar, setLoadingSimilar] = useState<boolean>(false);
  
  const searchCountRef = useRef<number>(0);
  const modalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const checkAndShowEmailModal = useCallback(() => {
    if (localStorage.getItem('emailSubmitted') === 'true') {
      return;
    }
    setShowEmailModal(true);
  }, []);

  useEffect(() => {
    const setupTimer = () => {
      if (modalTimerRef.current) {
        clearTimeout(modalTimerRef.current);
      }
      if (showEmailModal || localStorage.getItem('emailSubmitted') === 'true') {
        return;
      }
      modalTimerRef.current = setTimeout(() => {
        checkAndShowEmailModal();
      }, 5 * 60 * 1000); // 5 minutes
    };

    setupTimer();

    return () => {
      if (modalTimerRef.current) {
        clearTimeout(modalTimerRef.current);
      }
    };
  }, [showEmailModal, checkAndShowEmailModal]);

  const debounce = (func: (...args: any[]) => void, delay: number) => {
    let timeout: NodeJS.Timeout;
    return function(...args: any[]) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  };

  const fetchMovieSuggestions = async (movieName: string) => {
    if (movieName.length < 2) {
      setMovieSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    setSuggestionsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ movieName });
      const response = await fetch(`/api?${params.toString()}`);
      const data: MovieSuggestionResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch movie suggestions');
      }
      
      setMovieSuggestions(data.data || []);
      setShowSuggestions(true);
    } catch (err: any) {
      setError(err.message);
      setMovieSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setSuggestionsLoading(false);
    }
  };

  const debouncedFetchMovieSuggestions = useCallback(debounce((movieName: string) => {
    fetchMovieSuggestions(movieName);
  }, 600), []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const capitalizeWords = (str: string): string => {
    return str.split(' ').map(word => {
      if (word.length === 0) return '';
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  };
  
  const handleSearchTrigger = () => {
    if (localStorage.getItem('emailSubmitted') === 'true') return;
    
    searchCountRef.current += 1;
    if (searchCountRef.current % 3 === 0) {
      checkAndShowEmailModal();
    }
  };

  const searchImages = async (searchQuery = '', directorQuery = '', page = 0, movieId = '', customDisplayQuery: string | null = null) => {
    setLoading(true);
    setError(null);
    setMovieSuggestions([]);
    setShowSuggestions(false);
    setSuggestionsLoading(false);

    try {
      const params = new URLSearchParams();
      if (searchQuery) params.append('query', searchQuery);
      if (directorQuery) params.append('director', directorQuery);
      if (movieId) params.append('movieId', movieId);
      params.append('page', String(page));
      
      const response = await fetch(`/api?${params.toString()}`);
      const data: Omit<ApiResponse, 'searchParams'> = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch results');
      }
      
      const finalResults: ApiResponse = {
        ...data,
        searchParams: {
          query: searchQuery,
          director: directorQuery,
          movieId: movieId
        }
      };
      
      if (customDisplayQuery) {
        finalResults.query = customDisplayQuery;
      }
      
      setResults(finalResults);
      setCurrentPage(page);

    } catch (err: any) {
      setError(err.message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setQuery(inputValue);

    const hashIndex = inputValue.indexOf('#');
    if (hashIndex !== -1) {
      const movieName = inputValue.substring(hashIndex + 1).trim();
      if (movieName.length >= 2) {
        debouncedFetchMovieSuggestions(movieName);
      } else {
        setMovieSuggestions([]);
        setShowSuggestions(false);
      }
    } else {
      setMovieSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleInputFocus = () => {
    if (query.includes('#') && movieSuggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (suggestionsRef.current && suggestionsRef.current.contains(e.relatedTarget as Node)) {
      return;
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCurrentPage(0);
    setMovieSuggestions([]);
    setShowSuggestions(false);
    handleSearchTrigger();

    if (query.includes('#')) {
      const parts = query.split('#');
      const textBeforeHash = parts[0].trim();
      const movieQuery = parts[1]?.trim();

      if (!movieQuery) {
        setError("Please provide a movie name after the '#'.");
        setResults(null);
        return;
      }

      setLoading(true);
      setError(null);
      setResults(null);

      try {
        const params = new URLSearchParams({ movieName: movieQuery });
        const response = await fetch(`/api?${params.toString()}`);
        const suggestionsData: MovieSuggestionResponse = await response.json();

        if (!response.ok || !suggestionsData.success || !suggestionsData.data || suggestionsData.data.length === 0) {
          throw new Error(`Could not find a movie match for "${movieQuery}". Please try another name or use the suggestions dropdown.`);
        }

        const sortedSuggestions = [...suggestionsData.data].sort((a, b) => b.hit_score - a.hit_score);
        const topMovie = sortedSuggestions[0];
        
        if (!topMovie) {
           throw new Error(`Could not find a movie match for "${movieQuery}".`);
        }

        const displaySearchTerm = textBeforeHash 
          ? `"${textBeforeHash}" from "${topMovie.name}"`
          : topMovie.name;
          
        await searchImages(textBeforeHash, '', 0, topMovie.id, displaySearchTerm);

      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    } else {
      const parts = query.split('//').map(part => part.trim());
      const searchQuery = parts[0] || '';
      const directorQuery = parts[1] ? capitalizeWords(parts[1]) : '';
      
      if (searchQuery || directorQuery) {
        await searchImages(searchQuery, directorQuery, 0);
      } else {
        setResults(null);
        setError(null);
      }
    }
  };

  const handleSuggestionClick = (movie: MovieSuggestion) => {
    handleSearchTrigger();
    let textBeforeHash = query.split('#')[0].trim();
    const displaySearchTerm = textBeforeHash 
      ? `"${textBeforeHash}" from "${movie.name}"`
      : movie.name;

    searchImages(textBeforeHash, '', 0, movie.id, displaySearchTerm); 
    
    setMovieSuggestions([]); 
    setShowSuggestions(false); 
  };
  
  const handlePageChange = (newPage: number) => {
    if (newPage >= 0 && results?.searchParams) {
      const { query, director, movieId } = results.searchParams;
      searchImages(query, director, newPage, movieId, results.query);
    }
  };

  const fetchSimilarImages = async (image: ImageResult) => {
    setLoadingSimilar(true);
    setSimilarImages([]);
    
    try {
      const response = await fetch('/api/metas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: image.id }),
      });

      if (response.ok) {
        const data: MetasResponse = await response.json();
        if (data.success && data.data && data.data.similar_images) {
          setSimilarImages(data.data.similar_images);
        }
      } else {
        console.error('Failed to fetch similar images:', response.statusText);
      }
    } catch (err) {
      console.error('Failed to fetch similar images:', err);
    } finally {
      setLoadingSimilar(false);
    }
  };

  const handleImageClick = (image: ImageResult) => {
    setSelectedImage(image);
    setShowVideo(false);
    fetchSimilarImages(image);
  };

  const handleCloseModal = () => {
    setSelectedImage(null);
    setShowVideo(false);
    setSimilarImages([]);
    setLoadingSimilar(false);
  };

  const handleSimilarImageClick = (image: ImageResult) => {
    setSelectedImage(image);
    setShowVideo(false);
    fetchSimilarImages(image);
  };

  const handlePlayVideo = () => {
    setShowVideo(true);
  };

  const handleEmailSubmit = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/addEmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to submit email.');
      }

      localStorage.setItem('emailSubmitted', 'true');
      return { success: true };

    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const totalPages = results ? Math.ceil(results.total_available / 50) : 0;

  return (
    <div className="container">
       <EmailModal 
        show={showEmailModal} 
        onClose={() => setShowEmailModal(false)}
        onSubmit={handleEmailSubmit}
      />

      <header className="header">
        <h1>References Image Search</h1>
        <p>Discover amazing images from movies and creative content</p>
      </header>
      
      <div className="search-section">
        <form onSubmit={handleSubmit} className="search-form">
          <input
            type="text"
            value={query}
            onChange={handleQueryChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            placeholder='e.g., "city night", "car // Nolan", "close up #Inception"'
            className="search-input"
            disabled={loading}
            ref={searchInputRef}
          />
          <button 
            type="submit" 
            className="search-button"
            disabled={loading || !query.trim()}
          >
            <Search size={18} />
            {loading ? 'Searching...' : 'Search'}
          </button>
          
          <button 
            type="button" 
            className="help-button" 
            onClick={() => setShowHelp(!showHelp)}
            aria-label="Show search instructions"
          >
            <Info size={20} />
          </button>
        </form>

        {showHelp && (
          <div className="help-popover">
            <h4>How to Search</h4>
            <p>
              <strong>Basic Search:</strong> Just type what you're looking for.
              <br />
              <code>new york city skyline</code>
            </p>
            <p>
              <strong>Director Search:</strong> To filter by a specific director, add <code>//</code> followed by their name.
              <br />
              <code>wide shot // Wes Anderson</code>
            </p>
            <p>
              <strong>Movie Search:</strong> To search within a specific movie, use <code>#</code> followed by the movie's name to get suggestions. Clicking a suggestion or hitting Enter will search.
              <br />
              <code>blue filter #The Matrix</code>
            </p>
            <button className="close-help-button" onClick={() => setShowHelp(false)}>Got it</button>
          </div>
        )}

        {showSuggestions && movieSuggestions.length > 0 && (
          <div className="suggestions-dropdown" ref={suggestionsRef}>
            {movieSuggestions.map((movie) => (
              <div 
                key={movie.id} 
                className="suggestion-item" 
                onMouseDown={() => handleSuggestionClick(movie)}
              >
                {movie.name}
              </div>
            ))}
          </div>
        )}
      </div>

      {(loading || suggestionsLoading) && (
        <div className="loading">
          <div className="spinner"></div>
          <p>{suggestionsLoading ? 'Searching for movies...' : 'Searching for images...'}</p>
        </div>
      )}

      {error && (
        <div className="error">
          <h3>Error</h3>
          <p>{error}</p>
        </div>
      )}

      {!results && !loading && !error && (
        <div className="welcome-container">
          <div className="welcome-content">
            <h2>Welcome to References Image Search</h2>
            <p>Your visual library for film, commercials, and more.</p>
            <div className="welcome-tips">
              <h4>Search Tips</h4>
              <p>Use <code>//</code> to search by director (e.g., <code>car // Nolan</code>)</p>
              <p>Use <code>#</code> to search by movie (e.g., <code>close up #Inception</code>)</p>
            </div>
          </div>
        </div>
      )}

      {results && !loading && (
        <>
          <div className="results-header">
            <div className="results-info">
              Showing {results.results_count} of {results.total_available} results for "{results.query}"
            </div>
            
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 0}
                  className="pagination-button"
                >
                  <ChevronLeft size={16} /> Previous
                </button>
                
                <span className="page-info">Page {currentPage + 1} of {totalPages}</span>
                
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages - 1}
                  className="pagination-button"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>

          {results.data && results.data.length > 0 ? (
            <div className="image-grid">
              {results.data.map((image) => (
                <div key={image.id} className="image-card">
                  <div className="image-container" onClick={() => handleImageClick(image)}>
                    <img src={image.urls.thumbnail} alt={image.title} loading="lazy" />
                    {image.has_video && (
                      <div className="video-indicator"><Play size={12} /> Video</div>
                    )}
                  </div>
                  <div className="card-content">
                    <h3 className="card-title">{image.title}</h3>
                    <div className="card-meta">
                      {image.year && (<span><Calendar size={12} style={{ display: 'inline', marginRight: '4px' }} />{image.year}</span>)}
                      {image.category && (<span><Tag size={12} style={{ display: 'inline', marginRight: '4px' }} />{image.category}</span>)}
                    </div>
                    {image.caption && (<p className="card-caption">{image.caption}</p>)}
                    <div className="card-details">
                      {image.source_info.directors?.length > 0 && (<div><strong>Directors:</strong> {image.source_info.directors.join(', ')}</div>)}
                      {image.source_info.artists?.length > 0 && (<div><strong>Artists:</strong> {image.source_info.artists.join(', ')}</div>)}
                      {image.source_info.production_companies?.length > 0 && (<div><strong>Production:</strong> {image.source_info.production_companies.join(', ')}</div>)}
                      {image.source_info.brand && (<div><strong>Brand:</strong> {image.source_info.brand}</div>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-results">
              <h3>No results found</h3>
              <p>Try different keywords or check your spelling.</p>
            </div>
          )}
        </>
      )}

      {selectedImage && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="close-button" onClick={handleCloseModal}><X size={24} /></button>
            {showVideo && selectedImage.urls.video_thumbnail ? (
              <video controls autoPlay className="modal-video">
                <source src={selectedImage.urls.video_thumbnail} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            ) : (
              <>
                <img src={selectedImage.urls.medium_resolution} alt={selectedImage.title} className="modal-image" />
                {selectedImage.has_video && (
                  <button className="play-video-button" onClick={handlePlayVideo}>
                    <Play size={24} /> Play Video
                  </button>
                )}
              </>
            )}
            <div className="modal-details">
              <h3>{selectedImage.title}</h3>
              {selectedImage.caption && <p>{selectedImage.caption}</p>}
              {selectedImage.source_info.directors?.length > 0 && (<div><strong>Directors:</strong> {selectedImage.source_info.directors.join(', ')}</div>)}
              {selectedImage.source_info.artists?.length > 0 && (<div><strong>Artists:</strong> {selectedImage.source_info.artists.join(', ')}</div>)}
              {selectedImage.source_info.production_companies?.length > 0 && (<div><strong>Production:</strong> {selectedImage.source_info.production_companies.join(', ')}</div>)}
              {selectedImage.source_info.brand && (<div><strong>Brand:</strong> {selectedImage.source_info.brand}</div>)}
              
              <div className="similar-images-section">
                <h4>Similar Images</h4>
                {loadingSimilar ? (
                  <div className="similar-loading">
                    <div className="spinner"></div>
                    <p>Finding similar images...</p>
                  </div>
                ) : similarImages.length > 0 ? (
                  <div className="similar-images-grid">
                    {similarImages.map((img) => (
                      <div 
                        key={img.id} 
                        className="similar-image-item"
                        onClick={() => handleSimilarImageClick(img)}
                      >
                        <img src={img.urls.thumbnail} alt={img.title} />
                        {img.has_video && (
                          <div className="video-indicator"><Play size={10} /></div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-similar">No similar images found</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <p>Powered By <a href="https://femitaofeeq.com" target="_blank" rel="noopener noreferrer">Femi Taofeeq</a></p>
      </footer>
    </div>
  );
}

export default App;