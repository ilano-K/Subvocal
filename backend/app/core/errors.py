class AppError(Exception):
    """Base exception for application errors."""

class ValidationError(AppError):
    """Raised when application-level validation fails."""

class LLMValidationFailed(AppError):
    """Raised when LLM output validation fails"""

class LLMConnectionError(AppError):
    """Raised when LLM request fails"""

class FileTooLarge(AppError):
    """Raised when a file exceeds max file size limit."""
    
class UnsupportedFileType(AppError):
    """Raised when file is unsupported """

class ProcessingError(AppError):
    """Raised when document processing fails."""

class NotFoundError(AppError):
    """Raised when a requested source does not exist."""

class CompileFailed(AppError):
    """Raised when script compilation fails."""
    
# tts
class TTSUnavailable(AppError):
    """Narrator not installed, disabled, loading, or failed."""

class TTSVoiceNotFound(AppError):
    """Voice not installed"""

class TTSInstallConflict(AppError):
    """Install/uninstall requested while another is in progress."""

class InsufficientDiskSpace(AppError):
    """Not enough free space for the download."""