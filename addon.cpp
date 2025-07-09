#include <nan.h>
#include <string>
#include <memory>
#include <cstdint>
#include <array>
#include <algorithm>

// Callback function type
using ExtremumCallback = void(*)(const char* type, double price, int64_t time, void* baton);

// Circular buffer class
class CircularBuffer {
public:
    explicit CircularBuffer(uint32_t capacity)
        : capacity_(capacity), head_(0), size_(0), 
          prices_(new double[capacity]),
          times_(new int64_t[capacity]) {
    }

    ~CircularBuffer() {
        delete[] prices_;
        delete[] times_;
    }

    inline void push(double price, int64_t time) noexcept {
        const uint32_t index = (head_ + size_) % capacity_;
        prices_[index] = price;
        times_[index] = time;
        if (size_ < capacity_) {
            ++size_;
        } else {
            head_ = (head_ + 1) % capacity_;
        }
    }

    inline uint32_t size() const noexcept { return size_; }
    inline double price_at(uint32_t index) const noexcept { 
        return prices_[(head_ + index) % capacity_]; 
    }
    inline int64_t time_at(uint32_t index) const noexcept { 
        return times_[(head_ + index) % capacity_]; 
    }
    inline void clear() noexcept { 
        size_ = 0; 
        head_ = 0; 
    }

    // New method to access raw prices array
    inline const double* get_prices() const noexcept { return prices_; }
    inline uint32_t get_head() const noexcept { return head_; }
    inline uint32_t get_capacity() const noexcept { return capacity_; }

private:
    const uint32_t capacity_;
    uint32_t head_;
    uint32_t size_;
    double* prices_;
    int64_t* times_;
};

class ExtremumDetector {
public:
    ExtremumDetector(uint32_t threshold, ExtremumCallback callback, void* baton)
        : threshold_(threshold), callback_(callback), baton_(baton), 
          buffer_(threshold * 2 + 1) {}

    inline void processTick(double price, int64_t time) noexcept {
        buffer_.push(price, time);
        if (buffer_.size() >= threshold_ + 1) {
            evaluateExtrema(price, time);
        }
    }

    inline void reset() noexcept {
        buffer_.clear();
    }

private:
    inline void evaluateExtrema(double current_price, int64_t time) noexcept {
        bool is_minima = true;
        bool is_maxima = true;
        const uint32_t size = buffer_.size();

        if (!callback_) return;

        // Access raw prices array
        const double* prices = buffer_.get_prices();
        const uint32_t head = buffer_.get_head();
        const uint32_t capacity = buffer_.get_capacity();

        for (uint32_t i = 0; i < size; ++i) {
            const double past_price = prices[(head + i) % capacity];
            if (past_price == current_price) continue;
            is_minima &= past_price > current_price;
            is_maxima &= past_price < current_price;
            if (!is_minima && !is_maxima) break;
        }

        const char* type = "regular";
        if (is_minima) type = "minima";
        else if (is_maxima) type = "maxima";
        
        callback_(type, current_price, time, baton_);
    }

    const uint32_t threshold_;
    ExtremumCallback callback_;
    void* baton_;
    CircularBuffer buffer_;
};

class DetectorWrapper : public Nan::ObjectWrap {
public:
    static NAN_MODULE_INIT(Init) {
        v8::Local<v8::FunctionTemplate> tpl = Nan::New<v8::FunctionTemplate>(New);
        tpl->SetClassName(Nan::New("ExtremumDetector").ToLocalChecked());
        tpl->InstanceTemplate()->SetInternalFieldCount(1);

        Nan::SetPrototypeMethod(tpl, "processTick", ProcessTick);
        Nan::SetPrototypeMethod(tpl, "reset", Reset);

        constructor().Reset(Nan::GetFunction(tpl).ToLocalChecked());
        Nan::Set(target, Nan::New("ExtremumDetector").ToLocalChecked(),
                Nan::GetFunction(tpl).ToLocalChecked());
    }

    ~DetectorWrapper() {
        callback_.Reset();
    }

private:
    std::unique_ptr<ExtremumDetector> detector_;
    v8::Persistent<v8::Function> callback_;

    static void CallbackWrapper(const char* type, double price, int64_t time, void* baton) {
        Nan::HandleScope scope;
        v8::Persistent<v8::Function>* persistent = static_cast<v8::Persistent<v8::Function>*>(baton);
        v8::Local<v8::Function> cb = Nan::New(*persistent);

        v8::Local<v8::Value> argv[] = {
            Nan::New(type).ToLocalChecked(),
            Nan::New(price),
            Nan::New<v8::Number>(time)
        };

        Nan::AsyncResource("CallbackWrapper").runInAsyncScope(
            Nan::GetCurrentContext()->Global(),
            cb,
            3,
            argv
        );
    }

    static NAN_METHOD(New) {
        if (info.IsConstructCall()) {
            uint32_t threshold = info[0]->IsNumber() ? Nan::To<uint32_t>(info[0]).FromJust() : 1;
            v8::Local<v8::Function> cb = info[1]->IsFunction() ? 
                Nan::To<v8::Function>(info[1]).ToLocalChecked() : 
                v8::Local<v8::Function>();

            DetectorWrapper* obj = new DetectorWrapper();
            if (!cb.IsEmpty()) {
                obj->callback_.Reset(info.GetIsolate(), cb);
                obj->detector_ = std::make_unique<ExtremumDetector>(
                    threshold, CallbackWrapper, &obj->callback_);
            } else {
                obj->detector_ = std::make_unique<ExtremumDetector>(threshold, nullptr, nullptr);
            }
            obj->Wrap(info.This());
            info.GetReturnValue().Set(info.This());
        } else {
            v8::Local<v8::Value> argv[] = {info[0], info[1]};
            v8::Local<v8::Function> cons = Nan::New(constructor());
            info.GetReturnValue().Set(Nan::NewInstance(cons, 2, argv).ToLocalChecked());
        }
    }

    static NAN_METHOD(ProcessTick) {
        DetectorWrapper* obj = ObjectWrap::Unwrap<DetectorWrapper>(info.Holder());
        if (info.Length() < 2 || !info[0]->IsNumber() || !info[1]->IsNumber()) {
            Nan::ThrowTypeError("Expected price (number) and time (number)");
            return;
        }
        obj->detector_->processTick(
            Nan::To<double>(info[0]).FromJust(),
            Nan::To<int64_t>(info[1]).FromJust()
        );
        info.GetReturnValue().SetUndefined();
    }

    static NAN_METHOD(Reset) {
        DetectorWrapper* obj = ObjectWrap::Unwrap<DetectorWrapper>(info.Holder());
        obj->detector_->reset();
        info.GetReturnValue().SetUndefined();
    }

    static inline Nan::Persistent<v8::Function>& constructor() {
        static Nan::Persistent<v8::Function> my_constructor;
        return my_constructor;
    }
};

NODE_MODULE(extremum_detector, DetectorWrapper::Init)